# Repo strategy — public, monorepo, contract folded in

> Quick ADR-style note capturing the repo structure decision.

---

## Decision

- **Public repo** (keep current state)
- **Monorepo** — fold the contract source into `apps/contracts/` alongside `apps/web/` and `apps/support-agents/`
- **Mondeto entity owns the GitHub org**

## Why public

- The contract source is **already public** (verified on Celoscan — anyone can read it). Hiding the Git repo wouldn't change that.
- Public = trust signal for MiniPay reviewers + ecosystem builders.
- Open-source attracts contributions (campaigns, regional UX patches).
- No proprietary IP in the codebase — the game design is the moat, not the code.

## Why monorepo

- Atomic PRs across contract + frontend (e.g., when a contract function signature changes, the frontend changes in the same PR).
- Single CI pipeline, single typecheck pass, single deploy story.
- `pnpm-workspace.yaml` already exists; adding contracts is a 1-line change.
- Same monorepo currently hosts `apps/web/`, `apps/contracts/`, `apps/support-agents/`.

## Why not separate repos

- Independent release cadence is real, but UUPS upgrades are rare. The cost of split-repo overhead (lockstep deploys, version mismatch) outweighs the rare-event benefit at our stage.
- Auditors typically want a single tagged repo to point at anyway.

## Implementation

The contract source has been folded into `apps/contracts/` via `git subtree`.

### Future subtree updates

To pull updates from the upstream contract repo:
```bash
git subtree pull --prefix=apps/contracts <upstream-repo-url> main --squash
```

### Outstanding actions

- [ ] Archive the upstream contract repo as read-only once the import is confirmed clean
- [ ] Add Foundry CI for the contracts package (run tests on PR) — small follow-up PR
- [ ] Update the upstream repo's README to point at the new canonical location
