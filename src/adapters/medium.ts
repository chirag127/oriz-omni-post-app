/**
 * Medium adapter — STUB (DEPRECATED).
 *
 * Source of truth: Medium officially deprecated their public posting API in
 * 2023. The legacy POST https://api.medium.com/v1/users/<id>/posts endpoint
 * still exists but no longer accepts new integration tokens for non-partner
 * accounts, and creating new tokens via https://medium.com/me/settings was
 * removed. The Partner Program API is invite-only and not reachable here.
 *
 * Decision: surfaced as a permanent failure so the engine never retries.
 * If Medium ever revives a public API, replace this stub with a real impl
 * and add a knowledge/decisions/services/medium-restored.md entry.
 */

import { type Adapter, AdapterDeprecated, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface MediumConfig {
  /** Reserved for the day Medium restores public posting. Currently unused. */
  token?: string
}

export function medium(_config: MediumConfig = {}): Adapter {
  return {
    name: 'medium',
    supports: {
      markdownNative: true,
      htmlNative: true,
      canonicalUrl: true,
      maxBodyLength: 0,
      rateLimit: { perMinute: 0, burst: 0 },
    },
    async post(_article: Article): Promise<PostResult> {
      throw new AdapterDeprecated(
        'medium',
        'Medium deprecated their public posting API in 2023; new tokens cannot be minted.',
      )
    },
  }
}
