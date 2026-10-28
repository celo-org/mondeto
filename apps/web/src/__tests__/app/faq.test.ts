import { describe, it, expect } from 'vitest'
import { FAQ_GROUPS } from '@/app/faq/content'
import { BOARD_LABELS, type LeaderboardTab } from '@/lib/maps/leaderboards'

const allItems = FAQ_GROUPS.flatMap((g) => g.items)
const allCopy = allItems.map((i) => `${i.q} ${i.a}`).join('\n')

describe('FAQ anchors', () => {
  it('has a unique id for every group and every item', () => {
    // Support pastes these into replies (mondeto.app/faq#payout-timing), and a
    // duplicate id silently sends the player to the wrong answer.
    const ids = [...FAQ_GROUPS.map((g) => g.id), ...allItems.map((i) => i.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses url-safe ids', () => {
    for (const id of [...FAQ_GROUPS.map((g) => g.id), ...allItems.map((i) => i.id)]) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('keeps the answers support links to most often', () => {
    // These three carry the bulk of the ticket volume; renaming one breaks
    // links already sent to players.
    for (const id of ['payout-timing', 'not-daily', 'ranked-not-paid']) {
      expect(allItems.map((i) => i.id)).toContain(id)
    }
  })
})

describe('FAQ board naming', () => {
  it('never shows an internal board key that differs from its label', () => {
    // The FAQ said "AREA" for months because the key -> label mapping was
    // trapped inside a client component. AREA is internal; players see LAND.
    const internalOnly = (Object.keys(BOARD_LABELS) as LeaderboardTab[]).filter(
      (key) => BOARD_LABELS[key] !== key,
    )
    expect(internalOnly).toContain('AREA')

    for (const key of internalOnly) {
      expect(allCopy).not.toMatch(new RegExp(`\\b${key}\\b`))
    }
  })

  it('names the boards exactly as the leaderboard tabs do', () => {
    const boards = allItems.find((i) => i.id === 'boards')
    expect(boards).toBeDefined()
    for (const label of Object.values(BOARD_LABELS)) {
      expect(boards!.a).toContain(label)
    }
  })

  it('does not use the singular "TYCOON"', () => {
    // The tab is TYCOONS; the old FAQ said TYCOON, so players searching the
    // page for the board they were ranked on found nothing.
    expect(allCopy).not.toMatch(/\bTYCOON\b/)
  })
})

describe('FAQ facts', () => {
  // These are the exact values that were wrong before, verified against
  // mainnet `feeRate()` and `config()`. Re-verify with `cast call` before
  // changing either the copy or this test.
  it('states the 7.5% fee and never an older rate', () => {
    expect(allCopy).toContain('7.5% ')
    expect(allCopy).not.toMatch(/(^|[^.\d])5% /)
    expect(allCopy).not.toContain('3%')
  })

  it('does not repeat a stale halving period', () => {
    expect(allCopy).not.toMatch(/\b(14|182)[ -]day/)
    expect(allCopy).not.toMatch(/\bfourteen\b/i)
  })

  it('does not claim USDT is the only accepted coin', () => {
    const currency = allItems.find((i) => i.id === 'currency')
    expect(currency).toBeDefined()
    for (const token of ['USDT', 'USDC', 'USDm']) {
      expect(currency!.a).toContain(token)
    }
    expect(allCopy).not.toMatch(/USDT only/i)
  })

  it('does not promise that a resale pays exactly double', () => {
    // The old answer said getting sniped "pays you double what you paid",
    // which ignores both price decay and the fee.
    expect(allCopy).not.toMatch(/pay you double/i)
  })

  it('never tells players rewards are daily or need claiming', () => {
    expect(allCopy).not.toMatch(/daily reward/i)
    expect(allCopy).not.toMatch(/claim your reward/i)
  })
})

describe('FAQ support scope and the no-sell rule', () => {
  // Players keep asking support how to sell a pixel and how to recover MiniPay
  // deposits. There is no sell action, and MiniPay wallet questions are not
  // ours to answer, so the FAQ has to say both plainly.
  const support = FAQ_GROUPS.find((g) => g.id === 'support')

  it('never implies that a player can sell a pixel', () => {
    // map-reset used to say "until you sell them", which contradicts the
    // onboarding's "No sell button".
    const answers = allItems.map((i) => i.a).join('\n')
    expect(answers).not.toMatch(/\b(you|to|can) sell\b/i)
  })

  it('answers "Can I sell my pixel?" from the support section', () => {
    const item = support?.items.find((i) => i.id === 'can-i-sell')
    expect(item).toBeDefined()
    expect(item!.a).toMatch(/no sell button/i)
    expect(item!.a).toMatch(/no listing/i)
    // No resale promise and no timeline.
    expect(item!.a).not.toMatch(/\b(soon|within|guarantee\w*|will sell)\b/i)
  })

  it('says support is Mondeto-only and links the MiniPay FAQ', () => {
    expect(support).toBeDefined()
    const copy = support!.items.map((i) => i.a).join('\n')
    expect(copy).toContain('Mondeto support only')
    expect(support!.items.map((i) => i.link?.href)).toContain('https://minipay.to/faq')
  })

  it('says pixels cannot be sold on a marketplace or outside the app', () => {
    // Pixels are contract storage, not NFTs: there is nothing to list. Say so
    // where a player looks for how to sell, and warn about off-app offers.
    const item = support?.items.find((i) => i.id === 'marketplace')
    expect(item).toBeDefined()
    expect(item!.a).toMatch(/not NFTs or tokens/i)
    expect(item!.a).toMatch(/marketplace/i)
    expect(item!.a).toMatch(/only when another player buys it/i)
    expect(item!.a).not.toMatch(/\b(soon|within|guarantee\w*|will sell)\b/i)
  })
})
