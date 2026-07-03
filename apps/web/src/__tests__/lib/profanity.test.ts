import { describe, it, expect } from 'vitest'
import { checkProfanity } from '@/lib/profanity'
import { PROFANITY_LISTS } from '@/lib/profanityLists'

describe('checkProfanity', () => {
  it('accepts empty and whitespace-only strings', () => {
    expect(checkProfanity('').ok).toBe(true)
    expect(checkProfanity('   ').ok).toBe(true)
  })

  it('accepts ordinary names', () => {
    for (const name of ['alice', 'pixelqueen', 'nova', 'mapgod', 'farah']) {
      expect(checkProfanity(name)).toEqual({ ok: true })
    }
  })

  it('rejects English profanity (sanity check on the bundled dataset)', () => {
    expect(checkProfanity('fucker').ok).toBe(false)
    expect(checkProfanity('asshole').ok).toBe(false)
  })

  it('rejects entries from every multi-language list', () => {
    for (const [lang, words] of Object.entries(PROFANITY_LISTS)) {
      for (const word of words) {
        const result = checkProfanity(word)
        expect(result.ok, `${lang}: "${word}" should be blocked`).toBe(false)
      }
    }
  })

  it('returns a user-facing reason on rejection', () => {
    const result = checkProfanity('fucker')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/can't allow/)
  })

  it('catches leetspeak and casing variations (via English transformers)', () => {
    expect(checkProfanity('FuCkEr').ok).toBe(false)
    expect(checkProfanity('fvcker').ok).toBe(false)
  })
})
