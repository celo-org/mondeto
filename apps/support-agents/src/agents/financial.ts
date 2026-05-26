// Financial triage agent.
//
// Handles money concerns: failed buys, missing pixels, wrong charges,
// "I sent USDT and got nothing", refund requests.
//
// Phase 1 (this scaffold): produces a ticket draft + flags severity.
// Does NOT auto-refund, does NOT sign transactions, does NOT ask for
// seed phrases or private keys (refuses if offered).
//
// Phase 2 (TODO): wire Anthropic tool use for:
//   - read_celo_tx(hash)  — verify the tx on-chain via Forno
//   - read_pixel_owner(id)
//   - lookup_user_purchases(address)
//   - create_finance_ticket(title, body, severity)  → Notion
//   - notify_founder(message)  → Telegram DM

import { ask, MODELS } from '../anthropic.js'

const SYSTEM = `You are Mondeto's financial-support intake agent.

Mondeto is a pixel-buying game on Celo. Users buy pixels with supported
dollar stablecoins against the Mondeto contracts on Celo mainnet.

Rules — these are hard limits:
- NEVER ask for private keys, seed phrases, or recovery words. If the user
  offers one, refuse and tell them to stop, treat the wallet as compromised,
  and move funds to a new wallet.
- NEVER promise a refund. You produce a ticket; a human decides.
- NEVER send transactions yourself.

UI copy rules (MiniPay listing):
- "network fee" not "gas"
- "deposit" not "onramp" / "buy crypto"
- "withdraw" not "offramp" / "sell crypto"
- "stablecoin" / "digital dollar" not "crypto"
- never show raw 0x… as primary identifier; prefer phone / alias

Your job: produce a triage ticket draft.

Output ONLY strict JSON in this exact shape, no preamble, no markdown:
{
  "title": "<short, under 80 chars>",
  "body": "<markdown: ## What user reported, ## Tx hashes mentioned, ## Recommended human action>",
  "severity": "loss_of_funds" | "stuck_tx" | "billing_question" | "info",
  "needs_followup": ["<question>", "<question>"],
  "ping_founder": true | false
}

ping_founder must be true when severity == loss_of_funds OR the user is
clearly distressed AND the at-risk amount is over $5 USDT.`

export interface FinancialDraft {
  title: string
  body: string
  severity: 'loss_of_funds' | 'stuck_tx' | 'billing_question' | 'info'
  needs_followup: string[]
  ping_founder: boolean
}

export async function draftFinancialTicket(input: {
  message: string
  user: string
}): Promise<FinancialDraft> {
  const userBlock = `User: ${input.user}

Message:
${input.message}`

  const raw = await ask({
    model: MODELS.specialist,
    system: SYSTEM,
    user: userBlock,
    maxTokens: 800,
  })

  return JSON.parse(raw) as FinancialDraft
}
