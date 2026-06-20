/**
 * Bluesky (AT Protocol) adapter — REAL impl.
 *
 * API: AT Protocol via `@atproto/api` (BskyAgent)
 *   service:     https://bsky.social
 *   auth:        login(identifier, password) — App Password from
 *                https://bsky.app/settings/app-passwords (NEVER main password)
 *   rate-limit:  5000 points/hour per account; post = 3 points → ≈27/min
 *   free-tier:   fully free; no paid tier exists
 *   markdown:    NOT native — posts are plain text + faceted links
 *   canonical:   no canonical_url field; we always include the canonical link
 *
 * Long-form: app.bsky.feed.article lexicon is in preview as of 2026-06; we
 * post the short teaser + link, and let the consumer wire up article-record
 * support once the lexicon ships.
 *
 * Hard limit enforced by Bluesky:
 *   - text: 300 graphemes (we approximate with chars and trim safely)
 */

import {
  type Adapter,
  AdapterError,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

// We type-import to avoid a hard dep at scaffold time. The user installs
// `@atproto/api` themselves before running the adapter.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — optional peer-dep, resolved at runtime by the consumer.
import type { BskyAgent } from '@atproto/api'

const POST_MAX = 300
const SUFFIX = ' (read more: '
const SUFFIX_END = ')'

export interface BlueskyConfig {
  /** Handle (e.g. `chirag.bsky.social`) or DID. */
  identifier: string
  /** App password — NEVER the account password. */
  appPassword: string
  /** Service URL — defaults to `https://bsky.social`. */
  service?: string
  /** Optional language tags (BCP-47). Defaults to `['en']`. */
  langs?: readonly string[]
  /** Lazy factory so we don't require `@atproto/api` at import time. */
  agentFactory?: (service: string) => BskyAgent
}

export function bluesky(config: BlueskyConfig): Adapter {
  let cachedAgent: BskyAgent | null = null

  async function getAgent(): Promise<BskyAgent> {
    if (cachedAgent) return cachedAgent
    const factory =
      config.agentFactory ??
      (async (service: string): Promise<BskyAgent> => {
        const mod = (await import('@atproto/api')) as { BskyAgent: new (o: { service: string }) => BskyAgent }
        return new mod.BskyAgent({ service })
      })
    const agent = await Promise.resolve(factory(config.service ?? 'https://bsky.social'))
    await agent.login({ identifier: config.identifier, password: config.appPassword })
    cachedAgent = agent
    return agent
  }

  function trimToFit(article: Article): string {
    const link = article.canonicalUrl
    const overhead = SUFFIX.length + link.length + SUFFIX_END.length
    const room = POST_MAX - overhead
    const teaser = (article.teaser ?? article.plainBody).replace(/\s+/g, ' ').trim()
    if (teaser.length + overhead <= POST_MAX) {
      return `${teaser}${SUFFIX}${link}${SUFFIX_END}`
    }
    if (room <= 0) return link.slice(0, POST_MAX)
    return `${teaser.slice(0, room - 1).trimEnd()}…${SUFFIX}${link}${SUFFIX_END}`
  }

  return {
    name: 'bluesky',
    supports: {
      markdownNative: false,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: POST_MAX,
      rateLimit: { perMinute: 27, burst: 5 },
    },
    async post(article: Article): Promise<PostResult> {
      const agent = await getAgent()
      const text = trimToFit(article)
      try {
        const out = await agent.post({
          text,
          langs: [...(config.langs ?? ['en'])],
          createdAt: new Date().toISOString(),
        })
        return {
          adapter: 'bluesky',
          status: text.length < (article.teaser?.length ?? 0) ? 'short-linked' : 'posted',
          externalId: out.uri,
          externalUrl: `https://bsky.app/profile/${config.identifier}/post/${out.uri.split('/').pop() ?? ''}`,
          postedAt: new Date().toISOString(),
        }
      } catch (err) {
        throw new AdapterError(`bluesky: ${(err as Error).message}`)
      }
    },
  }
}
