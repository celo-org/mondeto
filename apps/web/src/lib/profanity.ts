// Profanity filter for user-set player names.
//
// User-entered names are a content-safety risk for MiniPay listing. Block
// explicit words before writing to the contract. The matcher combines
// `obscenity`'s English dataset with curated multi-language lists in
// `profanityLists.ts` (Swahili, Portuguese, French, Indonesian, romanized
// Hindi). The English-recommended transformers handle casing, leetspeak,
// and confusable Unicode characters — these work across Latin scripts.
//
// Devanagari Hindi is not yet matched (transformers strip non-alphabetic
// chars) — needs a separate matcher as a follow-up.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
  type BlacklistedTerm,
} from 'obscenity'
import { PROFANITY_LISTS } from './profanityLists'

const englishBuilt = englishDataset.build()

let nextId = englishBuilt.blacklistedTerms.length + 1
const customTerms: BlacklistedTerm[] = []

for (const words of Object.values(PROFANITY_LISTS)) {
  for (const word of words) {
    customTerms.push({ id: nextId++, pattern: parseRawPattern(word) })
  }
}

const matcher = new RegExpMatcher({
  blacklistedTerms: [...englishBuilt.blacklistedTerms, ...customTerms],
  whitelistedTerms: englishBuilt.whitelistedTerms,
  ...englishRecommendedTransformers,
})

export interface ProfanityCheck {
  ok: boolean
  reason?: string
}

export function checkProfanity(name: string): ProfanityCheck {
  const trimmed = name.trim()
  if (!trimmed) return { ok: true }

  if (matcher.hasMatch(trimmed)) {
    return {
      ok: false,
      reason: 'this name contains language we can\'t allow. try another.',
    }
  }

  return { ok: true }
}
