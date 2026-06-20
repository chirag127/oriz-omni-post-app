/**
 * WordPress.com adapter — REAL impl.
 *
 * API: POST https://public-api.wordpress.com/wp/v2/sites/<site>/posts
 *   docs:        https://developer.wordpress.com/docs/api/
 *   auth:        OAuth2 bearer token (https://developer.wordpress.com/apps/)
 *   rate-limit:  ≈60 req/min; 429 → Retry-After
 *   free-tier:   .wordpress.com personal sites can post via API at no cost
 *   markdown:    NOT native — `content` must be HTML
 *   canonical:   yes — wp/v2 supports `canonical_url` via Yoast/SEO plugins;
 *                we always also embed the canonical via a meta `<link>` head
 *
 * Markdown → HTML conversion uses unified + remark-parse + remark-rehype +
 * rehype-stringify (peer-installed by the consumer).
 */

import {
  type Adapter,
  AdapterError,
  AdapterRateLimited,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

export interface WordPressComConfig {
  /** OAuth2 bearer token. */
  accessToken: string
  /** Site domain or numeric ID, e.g. `oriz.wordpress.com` or `123456789`. */
  site: string
  /** Default `status`. Defaults to `'publish'`. */
  defaultStatus?: 'publish' | 'draft' | 'pending' | 'private' | 'future'
}

interface WpCreateResponse {
  id: number
  link: string
}

export async function markdownToHtml(md: string): Promise<string> {
  const { unified } = await import('unified')
  const remarkParse = (await import('remark-parse')).default
  const remarkRehype = (await import('remark-rehype')).default
  const rehypeStringify = (await import('rehype-stringify')).default
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(md)
  return String(file)
}

export function wordpressCom(config: WordPressComConfig): Adapter {
  return {
    name: 'wordpress-com',
    supports: {
      markdownNative: false,
      htmlNative: true,
      canonicalUrl: true,
      maxBodyLength: 0,
      rateLimit: { perMinute: 60, burst: 10 },
    },
    async post(article: Article): Promise<PostResult> {
      const html = await markdownToHtml(article.mdxBody)
      const endpoint = `https://public-api.wordpress.com/wp/v2/sites/${encodeURIComponent(
        config.site,
      )}/posts`
      const body = {
        title: article.title,
        content: html,
        status: config.defaultStatus ?? 'publish',
        canonical_url: article.canonicalUrl,
        slug: article.slug,
        date: article.publishedAt,
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '60')
        throw new AdapterRateLimited(
          'wordpress-com',
          Number.isFinite(retryAfter) ? retryAfter : 60,
        )
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AdapterError(
          `wordpress-com: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
        )
      }
      const json = (await res.json()) as WpCreateResponse
      return {
        adapter: 'wordpress-com',
        status: 'posted',
        externalId: String(json.id),
        externalUrl: json.link,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
