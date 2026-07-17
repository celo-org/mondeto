import type { Metadata } from 'next'
import { APP_ORIGIN, decodeShareParams, composeShareText } from '@/lib/share'
import ShareRedirect from './ShareRedirect'

/**
 * Crawlable share landing.
 *
 * When a player shares their standing, this is the URL that goes out. X /
 * Farcaster / iMessage crawlers fetch it and read the OG + Twitter-card meta
 * emitted by generateMetadata (pointing at /api/og for the dynamic image).
 * A human who clicks is immediately redirected into the app on the sharer's
 * map with their referral code (ShareRedirect), so the crawler sees a rich
 * card and the player lands in the game with attribution intact.
 *
 * The app is force-dynamic (see app/layout.tsx), so this route renders per
 * request — exactly what we want for param-driven metadata.
 */

type SearchParams = Record<string, string | string[] | undefined>

function toParams(searchParams: SearchParams): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') sp.set(key, value)
    else if (Array.isArray(value) && value.length > 0) sp.set(key, value[0])
  }
  return sp
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const sp = toParams(await searchParams)
  const { kind, params } = decodeShareParams(sp)
  const description = composeShareText(kind, params)
  // Reuse the exact incoming params for the image so the card matches the copy.
  const imageUrl = `${APP_ORIGIN}/api/og?${sp.toString()}`

  const title =
    kind === 'reward'
      ? 'I just won on Mondeto'
      : kind === 'rank'
        ? 'My Mondeto rank'
        : kind === 'positions'
          ? 'My Mondeto turf'
          : 'Mondeto — every pixel is up for grabs'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_ORIGIN}/s?${sp.toString()}`,
      siteName: 'Mondeto',
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = toParams(await searchParams)
  const { params } = decodeShareParams(sp)
  return <ShareRedirect mapId={params.mapId} refWallet={params.ref} />
}
