/**
 * Substack adapter — STUB (NO PUBLIC API).
 *
 * Source of truth: Substack does not publish a posting API. Their public
 * surface is read-only (RSS, public profile JSON), and the internal
 * publishing endpoints used by substack.com are unauthenticated only via
 * session cookies and explicitly disallowed by their ToS for third-party
 * automation.
 *
 * Decision: surface as a permanent no-public-API failure; the engine never
 * retries. If you need newsletter reach, point omnipost at the Buttondown
 * adapter instead (also free tier, REST API, supports drafts + scheduled).
 */

import { type Adapter, AdapterNoPublicApi, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface SubstackConfig {
  /** Reserved if Substack ever ships a posting API. */
  publicationDomain?: string
}

export function substack(_config: SubstackConfig = {}): Adapter {
  return {
    name: 'substack',
    supports: {
      markdownNative: false,
      htmlNative: true,
      canonicalUrl: false,
      maxBodyLength: 0,
      rateLimit: { perMinute: 0, burst: 0 },
    },
    async post(_article: Article): Promise<PostResult> {
      throw new AdapterNoPublicApi(
        'substack',
        'Substack publishes no public posting API; cookie-scraping is ToS-prohibited.',
      )
    },
  }
}
