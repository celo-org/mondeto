/**
 * Which map ids are revealed (visible/playable), resolved at runtime.
 *
 * Source-of-truth precedence:
 *   1. Vercel Edge Config key `revealedMapIds` — written by the admin board,
 *      takes effect instantly without a redeploy. This is the live control.
 *   2. NEXT_PUBLIC_REVEALED_MAP_IDS env var — deploy-time fallback.
 *   3. Default: WORLD only (`[0]`) — the launch state.
 *
 * Everything degrades gracefully: with no Edge Config configured and no env
 * set, the app reveals WORLD only, exactly as the static registry flags do.
 */

const DEFAULT_REVEALED_IDS = [0]

export function parseIds(raw: string | null | undefined): number[] | null {
  if (!raw || raw.trim() === '') return null
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
  return ids
}

function coerceIds(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const ids = value
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0)
    return ids
  }
  if (typeof value === 'string') return parseIds(value)
  return null
}

/**
 * Server-side resolve of the revealed map ids. Reads Edge Config first, then
 * the env var, then defaults to WORLD. Never throws — any failure falls
 * through to the next source.
 */
export async function readRevealedMapIdsServer(): Promise<number[]> {
  // 1. Edge Config (admin-controlled, runtime). Only attempt when an Edge
  //    Config connection is actually configured.
  if (process.env.EDGE_CONFIG) {
    try {
      const { get } = await import('@vercel/edge-config')
      const value = await get('revealedMapIds')
      const ids = coerceIds(value)
      if (ids && ids.length > 0) return ids
    } catch {
      // fall through to env / default
    }
  }

  // 2. Deploy-time env var.
  const envIds = parseIds(process.env.NEXT_PUBLIC_REVEALED_MAP_IDS)
  if (envIds && envIds.length > 0) return envIds

  // 3. Launch default.
  return DEFAULT_REVEALED_IDS
}

/**
 * Client-side default used before `/api/reveals` resolves. Honors the
 * build-time env var so static deploys without Edge Config still reflect it
 * immediately; otherwise WORLD only.
 */
export function defaultRevealedMapIdsClient(): number[] {
  const envIds = parseIds(process.env.NEXT_PUBLIC_REVEALED_MAP_IDS)
  if (envIds && envIds.length > 0) return envIds
  return DEFAULT_REVEALED_IDS
}
