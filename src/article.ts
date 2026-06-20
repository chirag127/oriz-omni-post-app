/**
 * Article — the canonical shape produced by the RSS parser and consumed by
 * every Adapter. One article == one entry in blog.oriz.in/rss.xml.
 *
 * The engine populates these fields from the RSS feed; adapters are
 * responsible for translating into platform-native shapes.
 */

export interface Article {
  /** Stable identifier from the RSS <guid>. The engine's idempotency key. */
  guid: string
  /** Human-readable post title. */
  title: string
  /** Original MDX source — used by adapters whose markdown is `'mdx'`. */
  mdxBody: string
  /** Plain-text rendering of the body — used to compute length for truncation. */
  plainBody: string
  /** URL slug, e.g. `'how-i-built-oriz'` — last segment of the canonical URL. */
  slug: string
  /** Canonical URL on `blog.oriz.in`. Adapters set this as their canonicalUrl. */
  canonicalUrl: string
  /** Free-form tags from the post frontmatter; adapter-side limits applied. */
  tags: readonly string[]
  /** Publish timestamp, ISO 8601. */
  publishedAt: string
  /** Optional cover image URL (already CDN-hosted). */
  coverImage?: string
  /** Optional first-paragraph teaser for short-link fallbacks. */
  teaser?: string
  /** Optional series metadata — present means the post is part of a series.
   *  External-platform adapters MUST link `series.canonicalSeriesUrl` only,
   *  never to sibling parts on the external platform. */
  series?: {
    slug: string
    title: string
    part: number
    canonicalSeriesUrl: string
  }
}
