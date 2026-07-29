// MiniPay deeplinks — canonical list:
// https://docs.minipay.xyz/technical-references/deeplinks.html#available-deeplinks
// Refetch periodically; MiniPay publishes new deeplinks.

export const MINIPAY_DEPOSIT_URL = 'https://link.minipay.xyz/add_cash' as const

// Support intake — a Google Form (private responses sheet + email
// notifications). Committed as the default so the in-app SUPPORT button opens
// the form on every deployment; NEXT_PUBLIC_SUPPORT_FORM_URL still overrides
// per-env. Being NEXT_PUBLIC_, the URL ships in the client bundle regardless.
export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_FORM_URL ??
  'https://docs.google.com/forms/d/e/1FAIpQLScrrV1YNYorWMSgH14E9aVq-GPFiYO55p2_9d9RRr9hnF78bQ/viewform'

// Where campaigns get announced. There is no community chat channel yet, so
// this is the only place a player can find out a campaign is starting — the
// FAQ points at it for exactly that reason.
export const X_PROFILE_URL = 'https://x.com/mondeto' as const
