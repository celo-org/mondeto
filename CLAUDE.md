# Mondeto — how this repo works

This file records the conventions the repo already follows, so that work
landing from here on stays consistent with what came before. It is
descriptive: everything below is drawn from the existing history, CI
config and committed docs, not invented for this file.

Domain-specific conventions live next to the code they govern and are
**not** repeated here:

- [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — logging rules (server OTel →
  PostHog vs. browser `console.warn/error`), `/dev` route gating
- [`apps/contracts/CLAUDE.md`](apps/contracts/CLAUDE.md) — UUPS storage
  layout, price formula, land mask, upgrade checklist
- [`docs/README.md`](docs/README.md) — index of MiniPay/QA and contract docs

## Layout

pnpm workspace (`apps/*`) driven by Turborepo.

| Path | What it is |
|---|---|
| `apps/web` | Next.js App Router app — the product. Most work happens here. |
| `apps/contracts` | Foundry / Solidity. UUPS proxy, one deployed map per continent. Also the Python land-mask tooling under `map/`. |
| `apps/subgraph` | Goldsky subgraph — earn/spend, time-ordered leaderboards, analytics. |
| `docs/` | MiniPay playbook, mobile QA, contract proposals + audit remediation. |
| `scripts/` | Land-mask conversion helpers (Python). |

## Setup

Pinned: **pnpm 8.10.0**, **Node 24** (`packageManager` + `engines`, and
what CI installs). Use those versions.

```sh
pnpm install
```

`apps/contracts` depends on git submodules (`forge-std`,
`openzeppelin-contracts`, `openzeppelin-contracts-upgradeable`). They are
not fetched by `pnpm install`:

```sh
git submodule update --init --recursive   # only needed to build/test Solidity
```

Common commands:

```sh
pnpm dev                       # turbo dev
pnpm --filter web type-check   # tsc --noEmit
pnpm --filter web test         # vitest run
pnpm --filter web build
pnpm -F web build:masks        # regenerate land masks into src/data/masks/
forge build && forge test      # in apps/contracts
```

## How work lands

Branch → pull request → **squash merge** into `main`. Nothing is pushed
straight to `main`; every commit in recent history carries its `(#NNN)`.

Because the repo squash-merges with the PR title as the subject and the PR
body as the message, **the pull request title becomes the commit on `main`
and the body becomes its commit message**. Write both as the record you
want in the log — rationale, verification and limits belong in the body,
not only in review comments.

The branch flow is **feature → PR into `staging` → verify on the staging
URL → `staging` → `main` → production**. `staging` runs the *same* Celo
mainnet contracts as production on a separate URL — the prod/staging
registry split was removed, so `apps/web/src/lib/maps/contracts.ts` is the
one registry both read. What differs is the URL and the env scope, not the
chain. `/dev/*` stays reachable on staging and preview deployments and
404s on production, gated by `VERCEL_ENV` in
[`apps/web/src/app/dev/layout.tsx`](apps/web/src/app/dev/layout.tsx).

CI runs on pull requests into **both** `main` and `staging`.

Protection on `main` is enforced server-side by an org ruleset, not by
this document: a PR is required, one approving review, the `ci / ci` check
must pass, the branch must be up to date with `main` first, approvals are
dismissed on push, and force-pushes and deletion are blocked. Squash is
the only merge button. Treat a green check as information rather than
permission — know what it ran.

### Branch names

`<author-handle>/<slug>` — the author's own GitHub handle, and a slug that
describes the problem rather than the solution:

```
GigaHierz/deals-map-heatmap-tiers
GigaHierz/non-land-pixel-checkout-fix
csacanam/document-repo-conventions
```

Bots keep their own prefix: Renovate opens `renovate/<slug>`.

Type prefixes (`feat/`, `fix/`, `chore/`, `docs/`) also appear in the
history. There was no cutover — the handle form has been in use since
mid-May 2026 and the two ran in parallel, with the type prefixes tapering
off through July and none since. Use the handle form; the type prefixes
are history rather than a live alternative.

### Titles

Conventional Commits, with a scope, in the imperative, stating the
outcome rather than the activity:

```
feat(profile): show LAND VALUE — current market value of owned pixels
fix(buy): block buying ocean pixels via long-press inspect path
perf(ranks): collapse leaderboard profile reads into one multicall
fix(analytics): treasury take = primary sales + resale fees, not volume × fee
docs(faq): answer the payout questions support actually gets
chore(deps): update posthog-js to 1.407.2
```

Types in use, by frequency: `fix`, `feat`, `chore`, `docs`, `perf`,
`style`, `test`, `refactor`, `build`.

Scopes are the product surface or subsystem touched — the recurring ones
are `buy`, `profile`, `ranks`, `deals`, `rewards`, `share`, `analytics`,
`minipay`, `wallet`, `maps`, `geo`, `rpc`, `contract`, `contracts`,
`web`, `deps`.

### Pull request body

Two shapes coexist, and both are fine — pick by size of change:

- **Prose** — one dense paragraph, no headings. Used for most
  self-contained fixes (see #174, #177, #179, #181).
- **Sectioned** — `##` headings for larger or multi-part changes (see
  #172, #183, #184, #185, #186). The heading names vary by what the
  change needs (`What`/`Why`/`How`, `Problem`/`Fix`/`Why it's safe`,
  per-app sections); there is no fixed template.

On a substantial change the content below is invariant, whichever shape
you pick. A small self-contained fix is often a single prose paragraph
with no sections and no metrics, and that is fine — scale the body to the
change.

1. **The problem, with its evidence.** What was actually observed, not a
   restatement of the title. Production data is cited when it exists —
   e.g. #174 opens with *"PostHog day-2 data showed ~25 users hitting
   'Selected pixel is not land'"*.
2. **The root cause.** Why it happened, specifically enough that a
   reviewer can check the diff against the explanation.
3. **What changes**, naming the modules, hooks and helpers touched.
4. **Why it's safe** where the change carries risk — blast radius, what
   is deliberately left alone, paired changes made outside the diff.
5. **Verification, with numbers.** `tsc --noEmit` clean, "N tests pass",
   build passes. State what was *not* verified automatically and needs a
   manual check on the preview deployment — #186 and #176 both do this
   rather than omitting it.

Scope discipline is part of the convention: PRs state non-goals and
follow-ups explicitly (`## Scope / non-goals` in #172, `## Deliberately
not included` in #183) instead of widening.

## What CI checks

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on **every**
pull request — the trigger is unfiltered, matching pm-kit's caller template
— and on pushes to `main` and `staging`. It calls the pm-kit shared
baseline (`celo-org/pm-kit` `ci-node.yml`), which runs the root scripts —
the required check is `ci / ci`:

```sh
pnpm run lint        # turbo run lint → apps/web `eslint .`
pnpm run typecheck   # turbo run type-check → apps/web `tsc --noEmit`
pnpm run test        # turbo run test:coverage → apps/web vitest + coverage
```

Run all three before opening a PR — they are exactly what will fail
otherwise. Coverage floors live in `apps/web/vitest.config.ts` and fail
the test step on regression.

**Builds and deploys are Vercel's job, not CI's** (`run-build: false`).
That is the org-wide split every repo on the pm-kit baseline uses, not a
local quirk: CI is the fast correctness gate, and the build signal comes
from the Vercel preview deployment that already runs on every PR.
Duplicating it would slow every merge for a signal we have. The trade-off
to know: a build break shows up on the Vercel check, and only `ci / ci` is
a *required* check — so read the preview result before merging rather than
treating a green `ci / ci` as "it builds".

Two things worth knowing about the lint step. It runs **ESLint 9 with flat
config** in [`apps/web/eslint.config.mjs`](apps/web/eslint.config.mjs) —
`next lint` is removed in Next 16 and ESLint 8 is end-of-life, so both were
migrated together. And it is **not currently a gate**: the rule set emits
22 warnings and no errors, and there is no `--max-warnings`, so the step
passes regardless. Choosing the rule set and putting a ceiling on that
count is tracked separately — until then, do not read a green lint step as
"no lint findings".

**Node: CI, local dev and production are all 24.** CI and local take it
from [`.nvmrc`](.nvmrc) — pm-kit's detection prefers that over the
workflow input, and the input is kept in sync as a fallback — `engines`
in every package agrees, and **Vercel runs 24.x**, set on the project
rather than in the repo. So a green CI run is evidence about the runtime
that actually serves players.

This was not always true: CI ran 20 against a production on 24, which
meant a green suite said nothing about Node 24 behaviour. Two
dependencies forced the question rather than a policy decision — pnpm 11
declares `node >=22.13` and jsdom 30 declares
`^22.22.2 || ^24.15.0 || >=26`, and both fail on 20 before running a
single test. Going to 24 rather than the 22.13 minimum closes the
production gap instead of merely clearing the dependency floor.

`apps/contracts` and `apps/subgraph` still have no gated CI beyond this:
contracts has no package.json (Foundry), and the subgraph defines no
`lint`/`test` scripts, so the turbo tasks don't reach them.

Dependencies are managed by Renovate (`renovate.json`, extending
`celo-org/.github`), with `rebaseWhen: behind-base-branch` — added in #166
to prevent a recurrence of the `pnpm-lock.yaml` merge corruption repaired
in #162.

## Deployment facts worth knowing before changing behaviour

Detail lives in [`README.md`](README.md); what matters when writing code:

- One contract per map (world + 7 continents) on Celo mainnet, registered
  in `apps/web/src/lib/maps/contracts.ts`. Adding or changing a map is a
  registry edit plus `pnpm -F web build:masks` — rendering, leaderboards
  and the active-map pointer all read the registry.
- Map visibility is a rollout env var (`NEXT_PUBLIC_REVEALED_MAP_IDS`),
  not a code change.
- `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL` points the app at the subgraph;
  unset falls back to the legacy live log-scan. Both paths need to keep
  working.

@.claude/shared/engineering-rules.md
@.claude/shared/money-path-checklist.md
