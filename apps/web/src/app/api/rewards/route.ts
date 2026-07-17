import { NextResponse } from 'next/server'
import { readRewardsServer } from '@/lib/rewards'

/**
 * A wallet's campaign rewards (or an empty list). The client reads this to
 * decide whether to show the "you won $X" announcement. Sourced from Edge
 * Config so the admin repo can publish payouts live — no redeploy, and no
 * amounts in the repo. Short cache so a freshly-published reward appears
 * within ~30s.
 *
 *   GET /api/rewards?address=0x...  ->  { rewards: RewardEntry[] }
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address') ?? ''
  const rewards = await readRewardsServer(address)
  return NextResponse.json(
    { rewards },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } },
  )
}
