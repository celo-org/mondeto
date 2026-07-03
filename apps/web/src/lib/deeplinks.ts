// MiniPay deeplinks — canonical list:
// https://docs.minipay.xyz/technical-references/deeplinks.html#available-deeplinks
// Refetch periodically; MiniPay publishes new deeplinks.

export const MINIPAY_DEPOSIT_URL = 'https://link.minipay.xyz/add_cash' as const

// Support intake — a Google Form (private sheet + email notifications).
// Set NEXT_PUBLIC_SUPPORT_FORM_URL once the form exists; until then the
// legacy Telegram group keeps the in-app support link functional.
export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_FORM_URL ?? 'https://t.me/mondetoSupport'
