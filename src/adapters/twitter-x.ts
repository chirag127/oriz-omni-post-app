/**
 * Twitter / X adapter — STUB (PAYWALLED).
 *
 * Source of truth: as of the X API v2 pricing page, Basic tier (the lowest
 * with `POST /2/tweets` access) is **$100 USD/month minimum**. Free tier is
 * read-only and capped at 1.5K tweets/month *retrieval* with no write
 * permissions. There is no exception for individual creators.
 *
 * Decision: surface as a permanent paywall failure. Use the
 * `short-link-fallback` adapter pointed at a Mastodon / Bluesky transport
 * if you want micro-reach without the X tax.
 */

import { type Adapter, AdapterPaywalled, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface TwitterXConfig {
  /** Reserved for the day someone actually pays the $100/mo bill. */
  bearerToken?: string
}

export function twitterX(_config: TwitterXConfig = {}): Adapter {
  return {
    name: 'twitter-x',
    supports: {
      markdownNative: false,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: 280,
      rateLimit: { perMinute: 0, burst: 0 },
    },
    async post(_article: Article): Promise<PostResult> {
      throw new AdapterPaywalled(
        'twitter-x',
        'X API v2 write access requires Basic tier at $100/month minimum.',
      )
    },
  }
}
