# Mondeto Support Agents

Telegram bot that listens on **t.me/mondetoSupport** and routes incoming
messages to one of three specialist agents (UI/UX, Financial, Campaign).

See [`docs/planning/SUPPORT_AGENTS_PLAN.md`](../../docs/planning/SUPPORT_AGENTS_PLAN.md) for
the full architecture, phased rollout plan, and why each agent looks the
way it does.

This package is the **phase 1** scaffold:

- Listens on the support group
- Classifies each message via Claude Haiku 4.5
- Generates a specialist draft (UI/UX issue, financial ticket, campaign lead) via Claude Sonnet 4.6
- Emits each routed message as a `support_message_routed` event to PostHog (EU). Falls back to `tickets.jsonl` on disk if `POSTHOG_API_KEY` is unset.
- Captures uncaught errors via PostHog's `captureException` so they show up in the error tracking dashboard alongside the event stream.
- **Does NOT reply** in the group yet (observation only)

Once the routing accuracy looks good in the log, flip the `AUTOREPLY` flags
in `src/index.ts` and wire the tool-use plumbing for GitHub / Notion in
each agent file.

## Setup

```bash
# From repo root
pnpm install

# Copy + fill in env
cp apps/support-agents/.env.example apps/support-agents/.env
# Edit apps/support-agents/.env with at minimum:
#   TELEGRAM_BOT_TOKEN  (from @BotFather)
#   ANTHROPIC_API_KEY   (from console.anthropic.com)
```

## Run locally

```bash
pnpm --filter support-agents dev
# Watches src/ and hot-reloads
```

Send a message in **t.me/mondetoSupport** and watch the log:

```bash
tail -f apps/support-agents/tickets.jsonl
```

Each line is one classified message + the draft the specialist agent
produced. Eyeball them for a few days, then enable auto-reply.

## Deploy

The bot is a long-lived process. Two reasonable hosts:

- **Railway** — easiest for long-running Node processes. Set env vars in the
  dashboard, point at this `apps/support-agents` folder, run `pnpm start`.
- **Vercel** — needs the webhook pattern (`grammy` supports it natively).
  Convert `bot.start()` to a webhook handler if you go this route.

## What's stubbed vs done

| Piece | Status |
|---|---|
| Telegram listener | ✅ done |
| Router (Haiku classifier) | ✅ done |
| UI/UX agent — draft generation | ✅ done |
| UI/UX agent — file GitHub issue | ⏳ tool-use stub, needs `GITHUB_TOKEN` + implementation |
| Financial agent — draft generation | ✅ done |
| Financial agent — on-chain tx verification (viem) | ⏳ TODO |
| Financial agent — Notion ticket write | ⏳ TODO |
| Financial agent — founder ping on loss-of-funds | ⏳ TODO |
| Campaign agent — draft generation | ✅ done |
| Campaign agent — Notion lead write | ⏳ TODO |
| Auto-reply in the group | 🔒 disabled by default — flip in `src/index.ts` |
| Dedup / multi-turn memory | ✅ PostHog event stream (`$insert_id = tg-msg-<id>`, `distinct_id = tg:<user>`) — query the last N events per user when needed |
| PII redaction in logs | ⏳ TODO |
| Rate limiting per user | ⏳ TODO |

## Guardrails to verify before enabling auto-reply

- [ ] Send 20 sample messages of each category, check the routing accuracy
- [ ] Verify the financial agent **refuses** when asked for seed phrases or private keys
- [ ] Verify draft tickets never expose raw `0x…` addresses as primary identifier
- [ ] Verify MiniPay banned terms ("gas", "crypto", "onramp", "offramp") never appear in any agent output
- [ ] Verify the founder ping path works end-to-end (financial → `ping_founder: true`)

## Cost rough estimate

At Claude pricing as of 2026-05:

- Router (Haiku 4.5): ~$0.001 / message
- Specialist (Sonnet 4.6) with prompt caching: ~$0.005 / message
- 100 messages/day → ~$0.60/day → ~$18/month

Prompt caching on the system prompts is enabled in `src/anthropic.ts`.
