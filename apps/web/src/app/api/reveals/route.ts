import { NextResponse } from 'next/server'
import { readRevealedMapIdsServer } from '@/lib/maps/reveals'

/**
 * Which maps are currently revealed. The client reads this on load so the
 * admin board's Edge Config toggles take effect live (no redeploy). Short
 * cache so reveals propagate within ~10s.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ids = await readRevealedMapIdsServer()
  return NextResponse.json(
    { ids },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' } },
  )
}
