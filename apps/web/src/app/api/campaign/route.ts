import { NextResponse } from 'next/server'
import { readCampaignServer } from '@/lib/campaign'

/**
 * The currently active campaign (or null). The client banner reads this on
 * load so Edge Config campaign changes take effect live — no redeploy, and
 * no prize/timing details in the repo. Short cache so a pulled campaign
 * disappears within ~30s.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const campaign = await readCampaignServer()
  return NextResponse.json(
    { campaign },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } },
  )
}
