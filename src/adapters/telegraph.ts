/**
 * Telegra.ph adapter — REAL impl.
 *
 * API: POST https://api.telegra.ph/createPage
 *   docs:        https://telegra.ph/api
 *   auth:        anonymous `access_token` from createAccount (one-time mint)
 *   rate-limit:  undocumented but generous; we cap at 30/min defensively
 *   free-tier:   fully free, fully anonymous; no paid tier
 *   markdown:    NOT native — body must be a `Node[]` DOM-ish array
 *   canonical:   no canonical field; we prepend a "originally at" paragraph
 *
 * Markdown → DOM-array conversion uses `unified` + `remark-parse` and a
 * tiny inline serializer that maps the mdast tree to the Telegraph node
 * shape: `{ tag, attrs?, children? }` or a bare string.
 */

import {
  type Adapter,
  AdapterError,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

const ENDPOINT = 'https://api.telegra.ph/createPage'

export interface TelegraphConfig {
  /** Long-lived access token from telegra.ph/api#createAccount. */
  accessToken: string
  /** Display author. */
  authorName: string
  /** Optional author URL (deep-link). */
  authorUrl?: string
}

/** Telegraph DOM node — the API's content shape. */
type TgNode = string | { tag: string; attrs?: Record<string, string>; children?: TgNode[] }

interface MdNode {
  type: string
  value?: string
  url?: string
  alt?: string
  depth?: number
  ordered?: boolean
  children?: MdNode[]
}

/**
 * Inline serializer: mdast → Telegraph node array.
 * Telegraph allows tags: a, aside, b, blockquote, br, code, em, figcaption,
 * figure, h3, h4, hr, i, iframe, img, li, ol, p, pre, s, strong, u, ul, video.
 */
function mdastToTelegraph(node: MdNode): TgNode | TgNode[] | null {
  switch (node.type) {
    case 'root':
      return (node.children ?? []).flatMap((c) => {
        const out = mdastToTelegraph(c)
        return out === null ? [] : Array.isArray(out) ? out : [out]
      })
    case 'paragraph':
      return { tag: 'p', children: childrenOf(node) }
    case 'heading': {
      const tag = (node.depth ?? 3) <= 3 ? 'h3' : 'h4'
      return { tag, children: childrenOf(node) }
    }
    case 'blockquote':
      return { tag: 'blockquote', children: childrenOf(node) }
    case 'list':
      return { tag: node.ordered ? 'ol' : 'ul', children: childrenOf(node) }
    case 'listItem':
      return { tag: 'li', children: childrenOf(node) }
    case 'code':
      return { tag: 'pre', children: [{ tag: 'code', children: [node.value ?? ''] }] }
    case 'inlineCode':
      return { tag: 'code', children: [node.value ?? ''] }
    case 'emphasis':
      return { tag: 'em', children: childrenOf(node) }
    case 'strong':
      return { tag: 'strong', children: childrenOf(node) }
    case 'link':
      return { tag: 'a', attrs: { href: node.url ?? '#' }, children: childrenOf(node) }
    case 'image':
      return { tag: 'img', attrs: { src: node.url ?? '', alt: node.alt ?? '' } }
    case 'thematicBreak':
      return { tag: 'hr' }
    case 'break':
      return { tag: 'br' }
    case 'text':
      return node.value ?? ''
    default:
      return childrenOf(node)
  }
}

function childrenOf(node: MdNode): TgNode[] {
  return (node.children ?? []).flatMap((c) => {
    const out = mdastToTelegraph(c)
    if (out === null) return []
    return Array.isArray(out) ? out : [out]
  })
}

interface TelegraphResponse {
  ok: boolean
  result?: { url: string; path: string }
  error?: string
}

export function telegraph(config: TelegraphConfig): Adapter {
  return {
    name: 'telegraph',
    supports: {
      markdownNative: false,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: 0,
      rateLimit: { perMinute: 30, burst: 5 },
    },
    async post(article: Article): Promise<PostResult> {
      const { unified } = await import('unified')
      const remarkParse = (await import('remark-parse')).default
      const tree = unified().use(remarkParse).parse(article.mdxBody) as MdNode
      const body = mdastToTelegraph(tree)
      const content: TgNode[] = [
        {
          tag: 'p',
          children: [
            { tag: 'em', children: ['Originally posted at '] },
            { tag: 'a', attrs: { href: article.canonicalUrl }, children: [article.canonicalUrl] },
            { tag: 'em', children: ['.'] },
          ],
        },
        ...(Array.isArray(body) ? body : body ? [body] : []),
      ]

      const params = new URLSearchParams({
        access_token: config.accessToken,
        title: article.title.slice(0, 256),
        author_name: config.authorName,
        content: JSON.stringify(content),
        return_content: 'false',
      })
      if (config.authorUrl) params.set('author_url', config.authorUrl)

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const json = (await res.json()) as TelegraphResponse
      if (!json.ok || !json.result) {
        throw new AdapterError(`telegraph: ${json.error ?? 'unknown error'}`)
      }
      return {
        adapter: 'telegraph',
        status: 'posted',
        externalId: json.result.path,
        externalUrl: json.result.url,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
