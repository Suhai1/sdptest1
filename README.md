# RAT — Repository Analysis Tool

Web dashboard for analysing git repository history: metrics per file / directory / repository / commit set / author, author identity merging, and multi-repo support. All numbers are computed locally from `git log` — no external services.

Built for COMS3011A. Stack: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4.

## Quick start

Requirements: Node.js ≥ 18.18 (tested on 18.19.1) and `git` on PATH.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build / full type check:

```bash
npm run build
```

> **Why Tailwind is pinned:** `tailwindcss` and `@tailwindcss/postcss` are pinned to exactly `4.1.18`. Tailwind ≥ 4.2 ships native `oxide` binaries whose `engines` field requires Node ≥ 20; on Node 18 npm silently skips them as optional dependencies and the build fails with `Cannot find module './tailwindcss-oxide.linux-x64-gnu.node'`. Do not bump or caret these versions while running Node 18.

## Adding repositories

Both ingestion paths run as a background job with visible phases (cloning → extracting → parsing → ready), managed from the sidebar:

- **Remote URL** — paste a clone URL (e.g. `https://github.com/redis/redis.git`); the server runs a bare clone.
- **Zip upload** — upload an archive containing the repository's `.git` directory (found up to 2 levels deep).

Multiple repositories can be registered and switched at any time. The sidebar trash icon deletes a repo's clone, parse cache, and merge config.

## Features

- **Metrics** per file / directory (subtree sums) / repository / commit set / author: added, removed, growth, churn, modifications, modification frequency, churn rate; per-author modifications, churn, and ownership.
- **Filters** (combinable): repository, author (raw identity or merge group), file/directory path via click-through drill-down with breadcrumb, time range on committer date (since inclusive / until exclusive), or an explicit commit set picked from a searchable commit list.
- **Author merging** — "Merge authors…" in the filter bar: group raw identities ("Name \<email\>") manually or apply the repository's `.mailmap` suggestions in one click; rename / unmerge before saving. Merged groups become selectable authors everywhere.
- **Dashboard** — summary cards, author ownership stacked bar, directory contents table with churn bars, commit picker with pagination and message search. Dark theme.

## Metric definitions

Let H = the commits matching the current filters: non-merge commits reachable from HEAD, parsed in a single `git log HEAD --no-merges -M50% --numstat` pass. Binary changes are skipped; a pure rename counts 0 lines; rename+edit counts the changed lines on the new path; a new file counts all additions; a deleted file counts its full removals.

| Metric | Definition |
|---|---|
| Commits (\|H\|) | number of commits in the selection |
| Added / Removed | Σ lines added / removed over H |
| Growth | added − removed |
| Churn | added + removed |
| Modifications | commits in H that touched the object (churn > 0) |
| Mod Freq | modifications / \|H\| |
| Churn Rate | churn / \|H\| |
| Ownership (author) | author's churn / total churn in the selection |

Directory and repository metrics are subtree sums over their files.

## Architecture

```
app/api/…            route handlers: repos (list/create), repo (get/delete),
                     metrics, authors, authors/merge, commits, tree
components/…         UI: sidebar, filter bar, metrics panel, commit picker, merge dialog
lib/engine/parse.ts  single git log pass → commit log
lib/engine/metrics.ts tree build + subtree aggregation + filter evaluation
lib/authors.ts       .mailmap parsing, identity grouping, ownership summarisation
lib/store.ts         repo registry, streamed JSONL parse cache, in-memory caches
lib/ingest.ts        bare clone (URL) and zip extraction
scripts/check.ts     CLI verifier — prints the same numbers as the API
```

Storage (runtime data is gitignored and rebuilt on demand):

```
repos/<id>/              cloned / extracted working repo (contains .git)
data/repos.json          repo registry (id, name, source, status, head)
data/cache/<id>.jsonl    streamed parse cache — metadata line + one line per commit
data/merges/<id>.json    author merge groups
```

Parsing streams the full history once and stores it as JSONL; after a server restart the first metrics request re-streams that cache instead of re-running `git log`. The history stays in memory afterwards, so filter changes only recompute aggregations.

## Verification

A CLI script prints metrics equivalent to the API for any ingested repo:

```bash
npx --yes tsx scripts/check.ts repos/<repo-dir-with-.git>
```

It also cross-checks the engine against raw `git show --numstat` for the newest commit (MATCH / MISMATCH).

Reference values — cJSON @ `6d9f244`, 955 non-merge commits:

| Scope | Result |
|---|---|
| repo root | added 46377, removed 11211, growth 35166, churn 57588, mods 953, freq 0.99791, churn rate 60.3016 |
| `cJSON.c` | +8165 / −4457, growth 3708, churn 12622, mods 445 |
| since 1672531200 (2023-01-01) | 40 commits, +448 / −85, churn 533 |
