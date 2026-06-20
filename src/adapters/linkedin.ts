/**
 * LinkedIn adapter — STUB (REQUIRES ENTERPRISE).
 *
 * Source of truth: LinkedIn's UGC Posts / Posts API
 * (https://learn.microsoft.com/linkedin/marketing/integrations/community-management/shares/ugc-post-api)
 * is gated behind the LinkedIn Marketing Developer Platform partner program,
 * which is invite-only and requires Microsoft / LinkedIn approval. The
 * `w_member_social` scope is no longer granted to new individual apps.
 *
 * Decision: surface as a permanent enterprise-only failure. The engine
 * will short-circuit retries.
 */

import { type Adapter, AdapterRequiresEnterprise, type PostResult } from '../adapter.ts'
import type { Article } from '../article.ts'

export interface LinkedInConfig {
  /** Reserved for the day partner approval lands. Currently unused. */
  accessToken?: string
  /** URN of the posting member or organization. */
  authorUrn?: string
}

export function linkedin(_config: LinkedInConfig = {}): Adapter {
  return {
    name: 'linkedin',
    supports: {
      markdownNative: false,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: 3000,
      rateLimit: { perMinute: 0, burst: 0 },
    },
    async post(_article: Article): Promise<PostResult> {
      throw new AdapterRequiresEnterprise(
        'linkedin',
        'LinkedIn UGC/Posts API access is partner-only via the Marketing Developer Platform.',
      )
    },
  }
}
