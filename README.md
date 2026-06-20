# @chirag127/oriz-omnipost

> **Omnipost — every-platform cross-poster for `blog.oriz.in`.**

`oriz-omnipost` watches the canonical RSS feed at
`https://blog.oriz.in/rss.xml`, diffs against persisted state, and
fans each new post out to every blogging platform that exposes a
public API. One adapter per platform. Idempotent. Canonical URL
preserved. Short-link fallback for platforms that refuse long content.

## Status

**Scaffold-stage.** The engine entry, types, and adapter interface
are stable. The platform adapters (`dev-to`, `hashnode`,
`short-link-fallback`) are stubs that throw `NotImplementedYet`. Real
implementations land after the platform-research pass.

## Mission

The family writes blogs once on `blog.oriz.in`. Distributing those
posts to where readers already live (dev.to, Hashnode, …) raises reach
without splitting authorship. Every cross-post points its
`canonical_url` back to `blog.oriz.in`, keeping SEO authority
consolidated.

## Architecture (design lock)

See [`knowledge/decisions/architecture/cross-post-engine.md`](../../knowledge/decisions/architecture/cross-post-engine.md)
in the master `oriz` repo for the full architectural decision.

```
RSS feed (blog.oriz.in/rss.xml)
        │
        ▼
   parseFeed() ──► Article[]
        │
        ▼
  diff against state.json (idempotent on RSS <guid>)
        │
        ▼
    For each new article × each adapter:
        │
        ▼
    Adapter.post(article)
        │  retry × 3 (1s/4s/16s backoff)
        ▼
    PostResult ──► state.json (committed back)
```

## Adapter interface

```ts
interface Adapter {
  name: string
  supports: {
    maxLengthChars?: number
    markdown: 'mdx' | 'gfm' | 'commonmark' | 'plain'
    canonicalUrl: boolean
  }
  post(article: Article): Promise<PostResult>
}
```

Adapters opt in to short-link fallback via a `truncationStrategy`
config — see `src/adapters/short-link-fallback.ts`.

## Supported / planned platforms

| Adapter | Status | API | Long content | Canonical URL |
|---|---|---|---|---|
| `dev-to` | stub | dev.to Articles API | yes | yes |
| `hashnode` | stub | Hashnode GraphQL | yes | yes |
| `short-link-fallback` | stub | s.oriz.in | n/a | n/a |

Future adapters (research pass output): Substack, Medium, LinkedIn,
Mastodon, Bluesky, Telegram channels, Reddit, Substack-API.

## Single-blog rule

Every post on `blog.oriz.in` is independently readable. Series ARE
allowed but each part links **only** back to the canonical landing
page on `blog.oriz.in/series/<slug>` — never to other parts of the
series on external platforms. The series-as-rabbit-hole stays
exclusive to the canonical site.

## Use

```bash
pnpm add @chirag127/oriz-omnipost
```

```ts
import { runRssCrossPost } from '@chirag127/oriz-omnipost'
import { devTo } from '@chirag127/oriz-omnipost/adapters/dev-to'
import { hashnode } from '@chirag127/oriz-omnipost/adapters/hashnode'

await runRssCrossPost({
  feedUrl: 'https://blog.oriz.in/rss.xml',
  adapters: [devTo({ token: process.env.OMNIPOST_DEVTO_TOKEN! }), hashnode({ token: process.env.OMNIPOST_HASHNODE_TOKEN! })],
  statePath: './state.json',
  dryRun: process.argv.includes('--dry-run'),
})
```

## Best-practice patterns used

- **Adapter** pattern — one file per platform.
- **Strategy** pattern — `truncationStrategy: 'fail' | 'short-link' | 'teaser'`.
- **Idempotency** — RSS `<guid>` keyed state; never reposts.
- **Retry-with-backoff** — 3 attempts × 1s/4s/16s.
- **Dead-letter** — failed entries logged in `state.json#failed`.
- **Observability** — Sentry breadcrumbs + structured JSON logs (Axiom-compatible).
- **Test-per-adapter** — vitest + msw mocks.
- **SemVer** — adapters in minor releases; engine breakage is major.
- **Secrets in env** — never in state.json.

## License

MIT — see [LICENSE](./LICENSE).

## Cross-refs

- [Decision: oriz-omnipost name](../../knowledge/decisions/branding/omnipost-name.md)
- [Decision: cross-post engine architecture](../../knowledge/decisions/architecture/cross-post-engine.md)
- [Service: s.oriz.in short-link Worker](../../knowledge/services/short-link/cloudflare-worker.md)
- [Glossary: omnipost](../../knowledge/glossary/o-r/omnipost.md)
