/**
 * Player-facing FAQ copy.
 *
 * Rebuilt from a week of support tickets. Nearly every "I wasn't paid" ticket
 * was a misunderstanding rather than a defect, with three root causes: payouts
 * land the day AFTER a campaign ends, campaigns don't run every day, and only
 * the board a campaign names gets paid. So REWARDS comes first — the onboarding
 * carousel embedded on the page already explains the game; this copy answers
 * the panic.
 *
 * Every item carries a stable `id` so support can send a player straight to one
 * answer (mondeto.app/faq#payout-timing). Don't rename ids casually — they get
 * pasted into support replies.
 *
 * Numbers here (5% fee, ~30-day halving) were verified against mainnet
 * `feeRate()` and `config()`. They're per-deployment constructor values, so
 * re-check with `cast call` before editing — three different halving periods
 * were in circulation across this repo before this was written.
 *
 * Lives beside the page rather than inside it so `__tests__/app/faq.test.ts`
 * can import it without pulling in React (a `page.tsx` may only export the
 * default component and Next's own route config).
 */

import { X_PROFILE_URL } from '@/lib/deeplinks'
import { BOARD_LABELS } from '@/lib/maps/leaderboards'

export interface QaItem {
  id: string
  q: string
  a: string
  /** Optional trailing link, rendered after the answer. */
  link?: { href: string; label: string }
}

export interface QaGroup {
  id: string
  title: string
  items: QaItem[]
}

export const FAQ_GROUPS: QaGroup[] = [
  {
    id: 'rewards',
    title: 'REWARDS AND PAYOUTS',
    items: [
      {
        id: 'how-rewards-work',
        q: 'How do I win rewards?',
        a: `Buy pixels. Owning pixels puts you on the leaderboards. When a reward campaign is running, the top players on that campaign's board win USDT.`,
      },
      {
        id: 'no-withdrawal',
        q: 'Do I need to withdraw my reward?',
        a: 'No. There is no claim button and nothing to withdraw. If you win, the USDT is sent straight to the wallet you played with, and it shows up in MiniPay like any other transfer.',
      },
      {
        id: 'payout-timing',
        q: 'When do rewards arrive?',
        a: `The day after the campaign ends. If you check the same night it closes, it won't be there yet — that's normal, not a problem. If nothing has arrived 24 hours after the campaign ended, contact support.`,
      },
      {
        id: 'not-daily',
        q: 'Is there a campaign every day?',
        a: 'No. Campaigns run on selected days, not daily. When one is live, a banner on the map shows it and counts down to the end. No banner means no campaign running — and no payout for that day.',
      },
      {
        id: 'which-board',
        q: 'Which leaderboard gets paid?',
        a: `It depends on the campaign. Some pay the ${BOARD_LABELS.AREA} board, some pay ${BOARD_LABELS.TYCOONS}, some pay ${BOARD_LABELS.EMPIRE}. The campaign banner says which board it pays and how many places. Topping a board the campaign didn't name pays nothing.`,
      },
      {
        id: 'ranked-not-paid',
        q: "I was on the leaderboard but didn't get paid. Why?",
        a: `Four things cause this, in order of how often we see them. One: the payout hadn't been sent yet — it comes the next day. Two: there was no campaign that day. Three: that campaign paid a different board than the one you were ranked on. Four: your rank fell outside the paid places by the time the campaign closed. Rankings are recalculated for every campaign, so placing one day doesn't carry over to the next.`,
      },
      {
        id: 'check-paid',
        q: 'How do I check whether I was paid?',
        a: 'Open your transaction history in MiniPay and look for an incoming USDT transfer on the day after the campaign. Every payout is an on-chain transfer, so it is permanently recorded and cannot go missing. If there is nothing 24 hours after the campaign ended, contact support.',
      },
      {
        id: 'campaign-updates',
        q: 'Where do I find out about campaigns?',
        a: 'Watch the banner on the map — it appears whenever a campaign is live. Campaigns are also announced on X.',
        link: { href: X_PROFILE_URL, label: '@mondeto on X' },
      },
    ],
  },
  {
    id: 'money',
    title: 'MONEY AND PRICES',
    items: [
      {
        id: 'currency',
        q: 'Which coins can I pay with?',
        a: 'Mondeto accepts USDT, USDC and USDm on Celo. One buy uses one coin, so if you are short, top up that coin or select fewer pixels.',
      },
      {
        id: 'gas',
        q: 'What network fees do I pay?',
        a: 'Almost nothing. Celo network fees are paid automatically in the stablecoin you are buying with, inside MiniPay — typically a fraction of a cent.',
      },
      {
        id: 'prices-up',
        q: 'How do prices work?',
        a: 'Each pixel has a base price. Every time someone buys it, the price doubles for the next buyer. So the more times a pixel changes hands, the more expensive it gets.',
      },
      {
        id: 'prices-down',
        q: 'What if a pixel sits unsold?',
        a: `Prices don't climb forever. A pixel's price falls continuously while nobody buys it — roughly halving every 30 days, down to a floor. There is no waiting period and no sudden drop; it ticks down every hour. Turn on the deals view on the map to see which land is cheapest right now.`,
      },
      {
        id: 'who-pays-whom',
        q: 'Who pays whom when I buy a pixel?',
        a: `If you buy a pixel from another player, they receive what you paid minus a 5% platform fee. If the pixel was unowned, the full amount goes to the contract's treasury.`,
      },
      {
        id: 'sniped',
        q: 'Can someone buy my pixel away from me?',
        a: `Yes — and that's how you get paid. Anyone can buy any pixel at its current price; there is no listing and no approval needed. The moment someone buys yours, you are paid in the same transaction: what they paid, minus the 5% fee. How much that is depends on timing. The instant a pixel is bought, its price doubles for the next buyer, then decays from there — halving about every 30 days. So a quick resale pays you close to double what you paid, while a pixel nobody touches for a long time gets cheaper for the next buyer, and pays you less.`,
      },
      {
        id: 'no-buyers',
        q: 'I bought a lot of pixels and nobody is buying them. Is my money gone?',
        a: `No. Nothing is locked and nothing expires. You keep the pixels and their color until someone buys them, and you stay on the leaderboards the whole time you hold — so you can still win campaign rewards. Anything you were paid for past sales is already in your wallet. Resale depends on other players, so a quiet day doesn't mean your land is worthless.`,
      },
    ],
  },
  {
    id: 'playing',
    title: 'PLAYING',
    items: [
      {
        id: 'what-is',
        q: 'What is Mondeto?',
        a: 'A pixel-buying game on Celo. The world map is 170 × 100 pixels, and each continent map has its own size. You buy pixels with stablecoins and paint the world your color.',
      },
      {
        id: 'map-reset',
        q: 'Does the map reset each day?',
        a: 'No. The map never resets. Your pixels stay yours until you sell them or another player buys them. Campaigns come and go; the map does not.',
      },
      {
        id: 'boards',
        q: 'How do leaderboards work?',
        a: `Three boards per map: ${BOARD_LABELS.AREA} (most pixels owned), ${BOARD_LABELS.EMPIRE} (largest single connected run of land), and ${BOARD_LABELS.TYCOONS} (single most valuable pixel). Each map has its own boards, so you can rank on one map and not another.`,
      },
      {
        id: 'buyout-rule',
        q: 'Can I stop someone from taking my pixel?',
        a: 'No, and nobody can stop you either. Buying is open to everyone at the current price — there is no listing, no approval and no way to lock a pixel. The price works the same whether a pixel is owned or not; the only difference is who gets paid.',
      },
      {
        id: 'usernames',
        q: 'I see weird names like "mango-curie". What are those?',
        a: `When you haven't set a player name yet, Mondeto picks one for you — a fruit plus a famous (and non-controversial) figure. Set your own name on the profile page if you want.`,
      },
    ],
  },
  {
    id: 'support',
    title: 'SUPPORT',
    items: [
      {
        id: 'contact',
        q: 'How do I contact support?',
        a: `Use the SUPPORT button on your profile page — it opens a short form, and a human reads every submission. Include your wallet address (it starts with 0x), which campaign you mean, and the date. Rewards are on-chain, so a player name, phone number or bank account can't be matched to a payment — the wallet address is the only thing we can look up. You can copy yours from MiniPay.`,
      },
      {
        id: 'who-runs',
        q: 'Who runs Mondeto?',
        a: 'Mondeto is operated by Celo Core Co. It is not operated by, affiliated with, or endorsed by Opera or MiniPay — MiniPay is just the wallet that makes Mondeto accessible inside their app.',
      },
    ],
  },
]
