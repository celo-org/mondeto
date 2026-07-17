/**
 * Active campaign config, resolved at runtime — never committed to source.
 *
 * Source of truth is the Vercel Edge Config key `campaign`, so campaigns can
 * be started, edited, and pulled instantly without a deploy, and prize/timing
 * details never appear in the public repo before they're announced.
 *
 * Shape (all times ISO-8601 UTC):
 *   {
 *     "id": "launch-week-1",
 *     "text": "prize pool live — top 3 per board win — climb the ranks",
 *     "ctaRoute": "/ranks",          // optional: where tapping the banner goes
 *     "startsAt": "2026-07-10T00:00:00Z",  // optional: hide before this
 *     "endsAt": "2026-07-17T00:00:00Z",    // optional: hide after this + countdown
 *     "mapId": 0                     // optional: only show on this map
 *   }
 *
 * Set the key to null (or remove it) to hide the banner everywhere.
 */

export interface CampaignConfig {
  id: string
  text: string
  ctaRoute?: string
  startsAt?: string
  endsAt?: string
  mapId?: number
}

function coerceCampaign(value: unknown): CampaignConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id === '') return null
  if (typeof v.text !== 'string' || v.text === '') return null
  const campaign: CampaignConfig = { id: v.id, text: v.text }
  if (typeof v.ctaRoute === 'string' && v.ctaRoute.startsWith('/')) {
    campaign.ctaRoute = v.ctaRoute
  }
  if (typeof v.startsAt === 'string') campaign.startsAt = v.startsAt
  if (typeof v.endsAt === 'string') campaign.endsAt = v.endsAt
  if (typeof v.mapId === 'number' && Number.isInteger(v.mapId) && v.mapId >= 0) {
    campaign.mapId = v.mapId
  }
  return campaign
}

/** True while `now` is inside the campaign's [startsAt, endsAt] window. */
export function isCampaignActive(campaign: CampaignConfig, now: Date): boolean {
  if (campaign.startsAt) {
    const start = Date.parse(campaign.startsAt)
    if (Number.isFinite(start) && now.getTime() < start) return false
  }
  if (campaign.endsAt) {
    const end = Date.parse(campaign.endsAt)
    if (Number.isFinite(end) && now.getTime() >= end) return false
  }
  return true
}

/**
 * Two-unit countdown label, always showing the two most-significant units so it
 * never collapses to a bare "12M": "3D 4H" / "4H 12M" / "0H 12M". Null if no
 * endsAt. (Floors to "0H 1M" in the final seconds so it never reads "0H 0M".)
 */
export function timeRemainingLabel(campaign: CampaignConfig, now: Date): string | null {
  if (!campaign.endsAt) return null
  const end = Date.parse(campaign.endsAt)
  if (!Number.isFinite(end)) return null
  const ms = end - now.getTime()
  if (ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}D ${hours}H`
  if (hours > 0) return `${hours}H ${mins}M`
  return `0H ${Math.max(mins, 1)}M`
}

/**
 * Server-side resolve of the active campaign. Edge Config only — no env or
 * hardcoded fallback, so an unset key simply means "no banner". Never throws.
 */
export async function readCampaignServer(): Promise<CampaignConfig | null> {
  if (!process.env.EDGE_CONFIG) return null
  try {
    const { get } = await import('@vercel/edge-config')
    const value = await get('campaign')
    const campaign = coerceCampaign(value)
    if (!campaign) return null
    return isCampaignActive(campaign, new Date()) ? campaign : null
  } catch {
    return null
  }
}
