/**
 * Adapter interface — every blogging-platform integration implements this.
 *
 * One file per platform under `src/adapters/`. Adapters MUST be pure modules
 * (no top-level side effects) so the engine can construct them on demand.
 *
 * Best-practice locks:
 *   - Adapter pattern: each platform is one file, one factory function.
 *   - Idempotency: the engine keys state by RSS <guid>; adapters never need
 *     to dedupe — but adapters MUST tolerate accidental retries (the engine
 *     does retry-with-backoff on network errors).
 *   - Canonical URL preservation: if `supports.canonicalUrl === false`, the
 *     engine will warn and skip the adapter unless the consumer explicitly
 *     opted in via `allowNonCanonical: true`.
 *   - Capability flags drive engine behaviour: when `markdownNative === false`
 *     the engine converts the article body before calling `post()`.
 */

import type { Article } from './article.ts'

export type PostStatus = 'posted' | 'short-linked' | 'skipped' | 'failed'

export interface AdapterRateLimit {
  /** Sustained per-minute call budget. */
  perMinute: number
  /** Burst budget — the engine may consume this much in a single tick. */
  burst: number
}

export interface AdapterSupports {
  /** Platform parses Markdown (any flavour) natively in its post body. */
  markdownNative: boolean
  /** Platform parses HTML natively in its post body. */
  htmlNative: boolean
  /** Platform supports rel=canonical / canonical_url on posts. */
  canonicalUrl: boolean
  /** Max bytes (UTF-8) of body the platform accepts. `0` means unlimited. */
  maxBodyLength: number
  /** Public API rate limit — engine respects this when fanning out. */
  rateLimit: AdapterRateLimit
}

export interface PostResult {
  /** Adapter `name` of the producer. */
  adapter: string
  /** Outcome — `'posted'` for full body, `'short-linked'` for teaser+s.oriz.in,
   *  `'skipped'` when the article didn't qualify, `'failed'` on terminal error. */
  status: PostStatus
  /** Platform's id for the created post, when known. */
  externalId?: string
  /** Public URL on the platform, when known. */
  externalUrl?: string
  /** Free-form error message when `status === 'failed'`. */
  error?: string
  /** ISO 8601 timestamp recorded by the engine. */
  postedAt: string
}

export interface Adapter {
  /** Stable name used as the state-file key (`'dev-to'`, `'hashnode'`, …). */
  name: string
  /** Capability flags consulted by the engine before calling `post`. */
  supports: AdapterSupports
  /** Publish one article. Throw or reject to signal a retryable failure. */
  post(article: Article): Promise<PostResult>
}

/**
 * Adapter error hierarchy.
 *
 * The engine treats subclasses as terminal-non-retryable: deprecated APIs,
 * paywalls, enterprise-only access, and missing public APIs will never
 * succeed on retry, so we short-circuit them. `AdapterRateLimited` is the
 * one retryable case — the engine sleeps + retries with exponential backoff.
 * `NotImplementedYet` is treated as terminal during a research pass.
 */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterError'
  }
}

/** Stub adapters throw this until the platform-research pass lands real impls. */
export class NotImplementedYet extends AdapterError {
  constructor(adapter: string) {
    super(`Adapter '${adapter}' is a stub — real implementation pending.`)
    this.name = 'NotImplementedYet'
  }
}

/** API was officially deprecated by the platform (e.g. Medium, 2023). */
export class AdapterDeprecated extends AdapterError {
  constructor(adapter: string, reason: string) {
    super(`Adapter '${adapter}' is deprecated: ${reason}`)
    this.name = 'AdapterDeprecated'
  }
}

/** Platform moved access behind a paywall (e.g. Hashnode May-2026, X $100/mo). */
export class AdapterPaywalled extends AdapterError {
  constructor(adapter: string, reason: string) {
    super(`Adapter '${adapter}' is paywalled: ${reason}`)
    this.name = 'AdapterPaywalled'
  }
}

/** Platform restricts API access to enterprise / partner programs (e.g. LinkedIn). */
export class AdapterRequiresEnterprise extends AdapterError {
  constructor(adapter: string, reason: string) {
    super(`Adapter '${adapter}' requires enterprise access: ${reason}`)
    this.name = 'AdapterRequiresEnterprise'
  }
}

/** Platform has no public API at all (e.g. Substack). */
export class AdapterNoPublicApi extends AdapterError {
  constructor(adapter: string, reason: string) {
    super(`Adapter '${adapter}' has no public API: ${reason}`)
    this.name = 'AdapterNoPublicApi'
  }
}

/** Retryable: platform returned a 429 / Retry-After. Engine backs off. */
export class AdapterRateLimited extends AdapterError {
  /** Optional seconds to wait before retrying, parsed from `Retry-After`. */
  readonly retryAfterSeconds?: number
  constructor(adapter: string, retryAfterSeconds?: number) {
    super(
      `Adapter '${adapter}' was rate-limited${
        retryAfterSeconds !== undefined ? ` (retry in ${retryAfterSeconds}s)` : ''
      }`,
    )
    this.name = 'AdapterRateLimited'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
