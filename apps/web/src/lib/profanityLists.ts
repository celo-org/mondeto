/**
 * Multi-language profanity word lists used by `checkProfanity` to validate
 * user-set names. Each language list is intentionally short and conservative:
 * universally-offensive explicit terms only, no mild slang or edge cases.
 *
 * Source: LDNOOBW (MIT-licensed, maintained by Shutterstock) —
 * https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
 *
 * Patterns are stored in their **post-transformer form** to match
 * obscenity's runtime behavior:
 * - No accented characters (`resolveConfusablesTransformer` strips them,
 *   so `cuzão` is written `cuzao`, `enculé` is `encule`).
 * - No consecutive duplicates over threshold 1 (`collapseDuplicatesTransformer`
 *   has threshold 1 for most letters; e.g. `porra` becomes `pora`,
 *   `connard` becomes `conard`, `chatte` becomes `chate`).
 * - No multi-word phrases — `skipNonAlphabeticTransformer` strips spaces
 *   from input, so phrases would only match if written without spaces.
 * - Very short or English-ambiguous terms (e.g. `asu`, `bite`, `pute`)
 *   are intentionally excluded — substring matches into legitimate words
 *   (`compute`, `dispute`, `casual`) would be a worse UX than missing the
 *   slur.
 *
 * Coverage priorities (per the MiniPay audience): Swahili, Portuguese,
 * French, Indonesian, romanized Hindi (Hinglish). Hindi in Devanagari
 * needs a separate matcher (transformers strip non-alphabetic chars).
 *
 * BEFORE A WIDE LAUNCH: have native speakers review and expand each list.
 * False positives on legitimate names are a worse UX than false negatives
 * (the contract owner can also blocklist on-chain after the fact).
 */

export const PROFANITY_LISTS: Record<string, readonly string[]> = {
  swahili: [
    'mbolo',
    'kumamayo',
    'mboro',
    'shashi',
    'sharmuta',
  ],
  portuguese: [
    'caralho',
    'pora',
    'foda',
    'foder',
    'cuzao',
    'vadia',
    'piroca',
    'buceta',
    'merda',
  ],
  french: [
    'putain',
    'merde',
    'salope',
    'conard',
    'conase',
    'encule',
    'enculer',
    'baiser',
    'chate',
    'couilles',
  ],
  indonesian: [
    'anjing',
    'bangsat',
    'bajingan',
    'kontol',
    'memek',
    'ngentot',
    'pantek',
    'pepek',
    'jancok',
    'goblok',
  ],
  hindi: [
    'chutiya',
    'chutiye',
    'madarchod',
    'maderchod',
    'bhenchod',
    'behenchod',
    'bhosdike',
    'bhosadike',
    'gandu',
    'lavda',
    'lawda',
    'harami',
  ],
} as const

export type ProfanityLanguage = keyof typeof PROFANITY_LISTS
