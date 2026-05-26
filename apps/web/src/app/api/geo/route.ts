import { NextRequest, NextResponse } from 'next/server'

/**
 * IP-based geolocation for the home-page auto-zoom.
 *
 * Browser `navigator.geolocation.getCurrentPosition` hangs forever in
 * MiniPay's WebView (no prompt, no callback). Using Vercel's request
 * headers, which carry city-level coordinates derived from the client
 * IP, sidesteps that entirely — no permission prompt, no WebView quirks,
 * works on every browser. City-level precision is plenty to zoom into
 * the user's region.
 *
 * Headers are populated by Vercel's edge network in production. Locally
 * they'll be absent (the route returns nulls), which is correct —
 * `localhost` has no public IP to geolocate.
 */
export async function GET(req: NextRequest) {
  const lat = req.headers.get('x-vercel-ip-latitude')
  const lng = req.headers.get('x-vercel-ip-longitude')
  const city = req.headers.get('x-vercel-ip-city')
  const country = req.headers.get('x-vercel-ip-country')

  return NextResponse.json(
    {
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      city: city ? decodeURIComponent(city) : null,
      country: country ? decodeURIComponent(country) : null,
    },
    {
      // Don't cache — the IP can change between visits (network,
      // wifi vs cellular, VPN), and the response is cheap to recompute.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
