/**
 * Hashnode adapter — STUB (PAYWALLED, May 2026).
 *
 * Source of truth: Hashnode moved their GraphQL `publishPost` mutation
 * behind the "Pro" tier in May 2026. Personal Access Tokens minted on free
 * accounts now return `INSUFFICIENT_PLAN` on any write mutation. Read
 * queries still work on free, but writes require an active subscription.
 *
 * Decision: surface as a permanent paywall failure for free accounts. If a
 * Pro key is supplied, the engine still treats this as paywalled — flip the
 * gate manually and add a real implementation only when the upgrade is
 * actually paid for. See knowledge/services/hashnode/paywall-2026.md.
 */

import { type Adapter, AdapterPaywalled, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface HashnodeConfig {
  /** Personal Access Token from https://hashnode.com/settings/developer */
  token?: string
  /** Publication ID to publish under (Hashnode org/blog). */
  publicationId?: string
}

export function hashnode(_config: HashnodeConfig = {}): Adapter {
  return {
    name: 'hashnode',
    supports: {
      markdownNative: true,
      htmlNative: false,
      canonicalUrl: true,
      maxBodyLength: 0,
      rateLimit: { perMinute: 0, burst: 0 },
    },
    async post(_article: Article): Promise<PostResult> {
      throw new AdapterPaywalled(
        'hashnode',
        'Hashnode moved publishPost behind the Pro tier in May 2026.',
      )
    },
  }
}
