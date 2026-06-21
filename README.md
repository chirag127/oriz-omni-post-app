# Oriz Omni — Cross-posting

> RSS-driven cross-poster — watches `blog.oriz.in/rss.xml` and fans each new post out to every blogging platform with a public API. One adapter per platform, idempotent, canonical URL preserved.

**Live at**: <https://omni.oriz.in> · **Status**: WIP

## What this is

A single-blog distribution engine. The family writes posts once on `blog.oriz.in`; this app diffs the RSS feed against persisted state and posts each new entry to every configured platform, with retry-with-backoff and a short-link fallback for platforms that refuse long content. Every cross-post sets `canonical_url` back to the source on `blog.oriz.in`.

## Per-feature inventory

| Feature | Status |
| --- | --- |
| Engine (`runRssCrossPost`) + RSS diff against `state.json` | ✅ live |
| Adapter interface + retry/backoff harness | ✅ live |
| `dev-to` adapter | 🚧 WIP (stub) |
| `hashnode` adapter | 🚧 WIP (stub) |
| `bluesky` / `buttondown` / `linkedin` / `medium` / `reddit` / `substack` / `telegraph` / `twitter-x` / `wordpress-com` adapters | 🚧 WIP (stubs) |
| `short-link-fallback` adapter (`s.oriz.in`) | 🚧 WIP (stub) |
| Dead-letter logging in `state.json#failed` | 📜 planned |

## App-specific env vars

`OMNIPOST_DEVTO_TOKEN`, `OMNIPOST_HASHNODE_TOKEN`, and one token per enabled adapter (see each `src/adapters/*.ts`). All others come from the family-wide set at `templates/.env.example`.

## Local dev

```bash
# from the workspace root (c:/D/oriz)
pnpm -F @chirag127/oriz-omnipost dev
```

## Knowledge

See [`./knowledge/`](./knowledge/) for app-specific decisions, runbooks, and services. Family rules / decisions / architecture live at the master repo's [`knowledge/`](../../../../knowledge/).

## License

Source-available, all rights reserved. See master [`LICENSE`](../../../../LICENSE) — same terms across the family.
