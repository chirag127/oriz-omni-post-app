/**
 * Engine entry — `runRssCrossPost`.
 *
 * Pure-ish function: takes a feed URL + adapters + state path, returns
 * the updated state. The CLI binary (added in a follow-up pass) wraps it.
 *
 * Best-practice locks honoured here:
 *   - Idempotent on RSS <guid>: articles already present in state are skipped.
 *   - Retry-with-exponential-backoff: 3 attempts × 2s/4s/8s, per adapter
 *     per article. Terminal failures land in `state.failed[]`.
 *   - Dead-letter: `state.failed` is surfaced in the CI summary, never auto-purged.
 *   - Observability: every action emits a structured JSON log line, plus
 *     terminal errors are forwarded to a Sentry-compatible `errorSink`.
 *   - --dry-run: short-circuits before any adapter is called.
 *   - JSONL state: each line is one CrossPostStateEntry, append-only friendly.
 *   - Capability-aware: when `adapter.supports.markdownNative === false` and
 *     `htmlNative === true`, we transcode body via remark→rehype before posting.
 *   - Length fallback: when body exceeds `adapter.supports.maxBodyLength`,
 *     we delegate to a caller-supplied `shortLinkFallback` adapter instead.
 */

import {
  type Adapter,
  AdapterDeprecated,
  AdapterError,
  AdapterNoPublicApi,
  AdapterPaywalled,
  AdapterRateLimited,
  AdapterRequiresEnterprise,
  NotImplementedYet,
  type PostResult,
} from './adapter.ts'
import type { Article } from './article.ts'

export interface CrossPostStateEntry {
  /** RSS <guid>. */
  guid: string
  /** ISO 8601 — when the engine last touched this entry. */
  postedAt: string
  /** Per-adapter results, keyed by adapter.name. */
  adapterResults: Record<string, PostResult>
}

export interface CrossPostState {
  /** Successfully-handled entries, keyed by guid. */
  entries: Record<string, CrossPostStateEntry>
  /** Terminal failures awaiting human intervention. */
  failed: Array<{ guid: string; adapter: string; error: string; failedAt: string }>
}

export interface ErrorSink {
  captureException(err: Error, context?: Record<string, unknown>): void
}

export interface CrossPostOptions {
  /** Canonical RSS feed URL — defaults to `https://blog.oriz.in/rss.xml`. */
  feedUrl: string
  /** Adapters to fan out to. Engine calls each in turn per article. */
  adapters: readonly Adapter[]
  /** Optional fallback used when an adapter rejects on length. */
  shortLinkFallback?: Adapter
  /** File path where state is persisted between runs (JSONL). */
  statePath: string
  /** When true, skip every adapter call and just log planned actions. */
  dryRun?: boolean
  /** When true, allow adapters whose `supports.canonicalUrl === false`. */
  allowNonCanonical?: boolean
  /** Optional logger; defaults to `console.log` with JSON-structured output. */
  log?: (event: Record<string, unknown>) => void
  /** Sentry-compatible sink. Defaults to `console.error`-shim. */
  errorSink?: ErrorSink
  /** Override fetcher (testing). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch
}

const TERMINAL_ERRORS = [
  AdapterDeprecated,
  AdapterPaywalled,
  AdapterRequiresEnterprise,
  AdapterNoPublicApi,
  NotImplementedYet,
]

function isTerminal(err: unknown): boolean {
  return TERMINAL_ERRORS.some((C) => err instanceof C)
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

function defaultLog(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))
}

const defaultSink: ErrorSink = {
  captureException(err, ctx) {
    console.error('[omnipost.error]', err.message, ctx ?? {})
  },
}

async function readState(path: string): Promise<CrossPostState> {
  const fs = await import('node:fs/promises')
  const state: CrossPostState = { entries: {}, failed: [] }
  try {
    const buf = await fs.readFile(path, 'utf8')
    for (const line of buf.split('\n')) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as
          | { kind: 'entry'; data: CrossPostStateEntry }
          | { kind: 'failed'; data: CrossPostState['failed'][number] }
        if (obj.kind === 'entry') state.entries[obj.data.guid] = obj.data
        else state.failed.push(obj.data)
      } catch {
        // skip malformed line
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  return state
}

async function appendState(
  path: string,
  payload:
    | { kind: 'entry'; data: CrossPostStateEntry }
    | { kind: 'failed'; data: CrossPostState['failed'][number] },
): Promise<void> {
  const fs = await import('node:fs/promises')
  await fs.appendFile(path, `${JSON.stringify(payload)}\n`, 'utf8')
}

interface RssItem {
  guid: string
  title: string
  link: string
  contentSnippet?: string
  content?: string
  pubDate?: string
  isoDate?: string
  categories?: readonly string[]
}

async function fetchFeed(url: string, fetchImpl: typeof fetch): Promise<RssItem[]> {
  const Parser = (await import('rss-parser')).default
  const parser = new Parser()
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status} ${res.statusText}`)
  const xml = await res.text()
  const feed = await parser.parseString(xml)
  return (feed.items ?? []).map((it) => ({
    guid: (it.guid ?? it.link ?? it.title) as string,
    title: it.title ?? '',
    link: it.link ?? '',
    contentSnippet: it.contentSnippet,
    content: it.content,
    pubDate: it.pubDate,
    isoDate: it.isoDate,
    categories: (it.categories ?? []) as readonly string[],
  }))
}

function itemToArticle(item: RssItem): Article {
  const slug = (item.link.split('/').filter(Boolean).pop() ?? item.guid).replace(/\?.*$/, '')
  const body = item.content ?? item.contentSnippet ?? ''
  return {
    guid: item.guid,
    title: item.title,
    mdxBody: body,
    plainBody: (item.contentSnippet ?? body).replace(/<[^>]+>/g, ''),
    slug,
    canonicalUrl: item.link,
    tags: item.categories ?? [],
    publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
    teaser: item.contentSnippet,
  }
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { tries: number; baseMs: number; log: (e: Record<string, unknown>) => void; adapter: string },
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= opts.tries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (isTerminal(err)) throw err
      const wait =
        err instanceof AdapterRateLimited && err.retryAfterSeconds
          ? err.retryAfterSeconds * 1000
          : opts.baseMs * 2 ** (attempt - 1)
      opts.log({
        event: 'adapter.retry',
        adapter: opts.adapter,
        attempt,
        waitMs: wait,
        error: (err as Error).message,
      })
      if (attempt === opts.tries) break
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

/**
 * Convert markdown body into HTML when an adapter only speaks HTML.
 * For the WordPress.com adapter we already convert in-adapter; this helper
 * is here for adapters that are pure HTML pipes and don't carry their own.
 */
async function transcodeForAdapter(article: Article, adapter: Adapter): Promise<Article> {
  if (adapter.supports.markdownNative) return article
  if (!adapter.supports.htmlNative) return article // adapter handles its own DOM
  const { unified } = await import('unified')
  const remarkParse = (await import('remark-parse')).default
  const remarkRehype = (await import('remark-rehype')).default
  const rehypeStringify = (await import('rehype-stringify')).default
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(article.mdxBody)
  return { ...article, mdxBody: String(file) }
}

export async function runRssCrossPost(options: CrossPostOptions): Promise<CrossPostState> {
  const log = options.log ?? defaultLog
  const errorSink = options.errorSink ?? defaultSink
  const fetchImpl = options.fetchImpl ?? fetch

  log({ event: 'engine.start', feedUrl: options.feedUrl, dryRun: options.dryRun ?? false })

  const state = await readState(options.statePath)
  const items = await fetchFeed(options.feedUrl, fetchImpl)
  log({ event: 'feed.parsed', itemCount: items.length })

  for (const item of items) {
    if (state.entries[item.guid]) {
      log({ event: 'item.skip.known', guid: item.guid })
      continue
    }
    const article = itemToArticle(item)
    const adapterResults: Record<string, PostResult> = {}

    for (const adapter of options.adapters) {
      if (!adapter.supports.canonicalUrl && !options.allowNonCanonical) {
        log({ event: 'adapter.skip.noncanonical', adapter: adapter.name, guid: item.guid })
        adapterResults[adapter.name] = {
          adapter: adapter.name,
          status: 'skipped',
          postedAt: new Date().toISOString(),
        }
        continue
      }

      const bodyBytes = utf8Bytes(article.mdxBody)
      const overLimit =
        adapter.supports.maxBodyLength > 0 && bodyBytes > adapter.supports.maxBodyLength

      if (options.dryRun) {
        log({ event: 'adapter.dryrun', adapter: adapter.name, guid: item.guid, overLimit })
        adapterResults[adapter.name] = {
          adapter: adapter.name,
          status: 'skipped',
          postedAt: new Date().toISOString(),
        }
        continue
      }

      try {
        let result: PostResult
        if (overLimit && options.shortLinkFallback) {
          log({ event: 'adapter.fallback.shortlink', adapter: adapter.name, guid: item.guid })
          result = await withBackoff(() => options.shortLinkFallback!.post(article), {
            tries: 3,
            baseMs: 2000,
            log,
            adapter: options.shortLinkFallback.name,
          })
          result = { ...result, status: 'short-linked' }
        } else if (overLimit) {
          throw new AdapterError(
            `${adapter.name}: body ${bodyBytes}B exceeds limit ${adapter.supports.maxBodyLength}B and no fallback is configured`,
          )
        } else {
          const transcoded = await transcodeForAdapter(article, adapter)
          result = await withBackoff(() => adapter.post(transcoded), {
            tries: 3,
            baseMs: 2000,
            log,
            adapter: adapter.name,
          })
        }
        adapterResults[adapter.name] = result
        log({ event: 'adapter.posted', adapter: adapter.name, guid: item.guid, status: result.status })
      } catch (err) {
        const error = err as Error
        const failedResult: PostResult = {
          adapter: adapter.name,
          status: 'failed',
          error: error.message,
          postedAt: new Date().toISOString(),
        }
        adapterResults[adapter.name] = failedResult
        const failedRow = {
          guid: item.guid,
          adapter: adapter.name,
          error: error.message,
          failedAt: new Date().toISOString(),
        }
        state.failed.push(failedRow)
        await appendState(options.statePath, { kind: 'failed', data: failedRow })
        errorSink.captureException(error, { adapter: adapter.name, guid: item.guid })
        log({
          event: 'adapter.failed',
          adapter: adapter.name,
          guid: item.guid,
          terminal: isTerminal(err),
          error: error.message,
        })
      }
    }

    const entry: CrossPostStateEntry = {
      guid: item.guid,
      postedAt: new Date().toISOString(),
      adapterResults,
    }
    state.entries[item.guid] = entry
    await appendState(options.statePath, { kind: 'entry', data: entry })
  }

  log({ event: 'engine.done', entries: Object.keys(state.entries).length, failed: state.failed.length })
  return state
}

/** Internal — exported for tests once the implementation lands. */
export type _Article = Article
