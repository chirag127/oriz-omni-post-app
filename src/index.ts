/**
 * @chirag127/oriz-omnipost — RSS-driven cross-poster for the oriz family.
 *
 * Watches blog.oriz.in/rss.xml, diffs against persisted state, and fans new
 * posts out to every configured Adapter. Idempotent on RSS <guid>. Each
 * external post preserves a canonical_url back to the original. Adapters that
 * refuse long content can opt into a short-link fallback served by s.oriz.in.
 *
 * See ../README.md and the architectural decision file at
 * knowledge/decisions/architecture/cross-post-engine.md (in the master oriz
 * repo) for the full design lock.
 */

// Core types + error hierarchy
export type {
  Adapter,
  AdapterRateLimit,
  AdapterSupports,
  PostResult,
  PostStatus,
} from './adapter.ts'
export {
  AdapterDeprecated,
  AdapterError,
  AdapterNoPublicApi,
  AdapterPaywalled,
  AdapterRateLimited,
  AdapterRequiresEnterprise,
  NotImplementedYet,
} from './adapter.ts'

// Article shape
export type { Article } from './article.ts'

// Engine
export {
  type CrossPostOptions,
  type CrossPostState,
  type CrossPostStateEntry,
  type ErrorSink,
  runRssCrossPost,
} from './engine.ts'

// Tier A — real adapters
export { bluesky, type BlueskyConfig } from './adapters/bluesky.ts'
export { buttondown, type ButtondownConfig, type ButtondownStatus } from './adapters/buttondown.ts'
export { devTo, type DevToConfig } from './adapters/dev-to.ts'
export { reddit, type RedditConfig } from './adapters/reddit.ts'
export { telegraph, type TelegraphConfig } from './adapters/telegraph.ts'
export { markdownToHtml, wordpressCom, type WordPressComConfig } from './adapters/wordpress-com.ts'

// Tier B — rejected / paywalled stubs
export { hashnode, type HashnodeConfig } from './adapters/hashnode.ts'
export { linkedin, type LinkedInConfig } from './adapters/linkedin.ts'
export { medium, type MediumConfig } from './adapters/medium.ts'
export { substack, type SubstackConfig } from './adapters/substack.ts'
export { twitterX, type TwitterXConfig } from './adapters/twitter-x.ts'

// Fallback
export { shortLinkFallback, type ShortLinkFallbackConfig } from './adapters/short-link-fallback.ts'
