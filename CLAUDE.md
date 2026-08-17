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

Pinned: **pnpm 8.10.0**, **Node 20** (`packageManager` + `engines`, and
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

Because the repo squash-merges with `COMMIT_OR_PR_TITLE`, **the pull
request title becomes the commit message on `main`**. Write the title as
the commit you want in the log.

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

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on PRs to
`main` and on pushes to `main`. It calls the pm-kit shared baseline
(`celo-org/pm-kit` `ci-node.yml`), which runs the root scripts — the
required check is `ci / ci`:

```sh
pnpm run lint        # turbo run lint → apps/web `next lint`
pnpm run typecheck   # turbo run type-check → apps/web `tsc --noEmit`
pnpm run test        # turbo run test:coverage → apps/web vitest + coverage
```

Run all three before opening a PR — they are exactly what will fail
otherwise. Coverage floors live in `apps/web/vitest.config.ts` and fail
the test step on regression. Builds and deploys are Vercel's job, not
CI's (`run-build: false`).

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
