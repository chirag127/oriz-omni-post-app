/**
 * Short-link fallback adapter.
 *
 * Use this for platforms that:
 *   (a) accept only short text (Twitter / X, Mastodon, Bluesky, Telegram, …), OR
 *   (b) have no API at all, but accept a posted URL via webhook / RSS-in.
 *
 * Behaviour: mints a unique short slug on `s.oriz.in` (the family's
 * Cloudflare Worker shortener — see
 * knowledge/services/short-link/cloudflare-worker.md), then posts a teaser
 * + that short link via the configured `transport`.
 *
 * The mint URL and per-adapter `transport` are caller-supplied because the
 * engine itself doesn't know about every micro-platform.
 */

import { type Adapter, AdapterError, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface ShortLinkFallbackConfig {
  /** Endpoint that mints `s.oriz.in/<slug>` for a canonical URL. */
  shortenerEndpoint: string
  /** Auth token for the shortener Worker (App Check or static secret). */
  shortenerToken: string
  /** Stable name suffix — adapters can be `'short-link:twitter'`, etc. */
  targetName: string
  /** Caller-supplied delivery: posts the (teaser + short URL) string somewhere. */
  transport: (payload: { teaser: string; shortUrl: string; article: Article }) => Promise<{
    externalId?: string
    externalUrl?: string
  }>
  /** Max chars for the underlying transport (default 280 — Twitter-class). */
  maxChars?: number
}

interface ShortenerResponse {
  shortUrl: string
}

export function shortLinkFallback(config: ShortLinkFallbackConfig): Adapter {
  const maxChars = config.maxChars ?? 280
  return {
    name: `short-link:${config.targetName}`,
    supports: {
      markdownNative: false,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: maxChars,
      rateLimit: { perMinute: 30, burst: 5 },
    },
    async post(article: Article): Promise<PostResult> {
      const mintRes = await fetch(config.shortenerEndpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.shortenerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ canonicalUrl: article.canonicalUrl, slug: article.slug }),
      })
      if (!mintRes.ok) {
        const t = await mintRes.text().catch(() => '')
        throw new AdapterError(
          `short-link: shortener ${mintRes.status} ${mintRes.statusText} — ${t.slice(0, 200)}`,
        )
      }
      const { shortUrl } = (await mintRes.json()) as ShortenerResponse
      const overhead = shortUrl.length + 1 // space before url
      const teaserSrc = (article.teaser ?? article.plainBody).replace(/\s+/g, ' ').trim()
      const room = maxChars - overhead
      const teaser = teaserSrc.length > room ? `${teaserSrc.slice(0, room - 1).trimEnd()}…` : teaserSrc
      const out = await config.transport({ teaser, shortUrl, article })
      return {
        adapter: `short-link:${config.targetName}`,
        status: 'short-linked',
        externalId: out.externalId,
        externalUrl: out.externalUrl,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
