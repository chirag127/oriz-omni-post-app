/**
 * dev.to (Forem) adapter — REAL impl.
 *
 * API: POST https://dev.to/api/articles
 *   docs:        https://developers.forem.com/api/v1#tag/articles/operation/createArticle
 *   auth:        header `api-key: <token>` (PAT from https://dev.to/settings/extensions)
 *   rate-limit:  60 req/min/user (Forem default; 429 → Retry-After)
 *   free-tier:   posting articles is free for all dev.to accounts
 *   markdown:    GFM, parsed natively; `body_markdown` is the canonical input
 *   canonical:   `canonical_url` field — preserves SEO back to blog.oriz.in
 *
 * Hard limits enforced by Forem:
 *   - title:        max 250 chars
 *   - body:         max 65535 chars (utf-8)
 *   - tags:         max 4, lowercase, alphanum
 */

import {
  type Adapter,
  AdapterError,
  AdapterRateLimited,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

const ENDPOINT = 'https://dev.to/api/articles'
const TITLE_MAX = 250
const BODY_MAX = 65535
const TAG_MAX = 4

export interface DevToConfig {
  /** API token from https://dev.to/settings/extensions ("DEV Community API Keys"). */
  token: string
  /** Optional organization slug to publish under. */
  organizationSlug?: string
  /** Default `published: true | false` — drafts when false. Defaults to true. */
  publishedByDefault?: boolean
}

interface DevToCreateResponse {
  id: number
  url: string
}

export function devTo(config: DevToConfig): Adapter {
  return {
    name: 'dev-to',
    supports: {
      markdownNative: true,
      htmlNative: false,
      canonicalUrl: true,
      maxBodyLength: BODY_MAX,
      rateLimit: { perMinute: 60, burst: 10 },
    },
    async post(article: Article): Promise<PostResult> {
      if (article.title.length > TITLE_MAX) {
        throw new AdapterError(`dev-to: title exceeds ${TITLE_MAX} chars`)
      }
      if (article.mdxBody.length > BODY_MAX) {
        throw new AdapterError(`dev-to: body exceeds ${BODY_MAX} chars`)
      }

      const tags = article.tags
        .slice(0, TAG_MAX)
        .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(Boolean)

      const body = {
        article: {
          title: article.title,
          body_markdown: article.mdxBody,
          published: config.publishedByDefault ?? true,
          canonical_url: article.canonicalUrl,
          tags,
          ...(config.organizationSlug ? { organization_id: config.organizationSlug } : {}),
          ...(article.coverImage ? { main_image: article.coverImage } : {}),
        },
      }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': config.token,
          'content-type': 'application/json',
          accept: 'application/vnd.forem.api-v1+json',
        },
        body: JSON.stringify(body),
      })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '60')
        throw new AdapterRateLimited('dev-to', Number.isFinite(retryAfter) ? retryAfter : 60)
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AdapterError(`dev-to: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
      }

      const json = (await res.json()) as DevToCreateResponse
      return {
        adapter: 'dev-to',
        status: 'posted',
        externalId: String(json.id),
        externalUrl: json.url,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
