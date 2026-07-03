'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import AvatarBlock from '@/components/Profile/AvatarBlock'
import StatsRow from '@/components/Profile/StatsRow'
import ColorPicker from '@/components/Profile/ColorPicker'
import { useProfile } from '@/hooks/useProfile'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { WIDTH, HEIGHT, ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { formatUSDT, formatBalanceForDisplay } from '@/lib/colorUtils'
import { isLand } from '@/lib/landMask'
import { SUPPORT_URL } from '@/lib/deeplinks'
import { checkProfanity } from '@/lib/profanity'
import { ConnectButton } from '@/components/connect-button'
import { InviteButton } from '@/components/InviteButton'
import { track } from '@/lib/analytics'

export default function ProfilePage() {
  const { address } = useAccount()
  const addrStr = address as string | undefined
  // URL input removed — unverified user URLs are an injection vector.
  // setUrl is left wired but unused so existing useProfile callers keep
  // their shape; updateProfile is called below with an empty string for url.
  const { currentMapId } = useMaps()
  const mondetoAddress = getContractByMapId(currentMapId)
  const { name, setName, color, setColor, saveState, save } = useProfile(addrStr, currentMapId)
  const walletBalance = useStablecoinBalance()
  // Guaranteed-defined read client. Pixel-count + P&L still resolve when
  // the user is browsing without a wallet (they just won't have personal
  // stats, but the contract reads work generically).
  const publicClient = useReadClient()
  const [nameError, setNameError] = useState<string | null>(null)

  const [pixelCount, setPixelCount] = useState(0)
  const [rank, setRank] = useState(0)
  const [spent, setSpent] = useState(0n)
  const [earned, setEarned] = useState(0n)

  // Fetch owned pixel count from contract
  useEffect(() => {
    if (!publicClient || !addrStr) return

    async function fetchStats() {
      try {
        // Fetch pixel batch for the full map
        const batchData = await publicClient!.readContract({
          address: mondetoAddress,
          abi: MONDETO_ABI,
          functionName: 'getPixelBatch',
          args: [0, 0, WIDTH, HEIGHT],
        }) as `0x${string}`

        // Decode packed bytes: 24 bytes per land pixel
        const hex = batchData.slice(2) // remove 0x
        const byteCount = hex.length / 2
        const recordCount = Math.floor(byteCount / 24)

        // Count pixels owned by current user and track all owners for rank
        const ownerCounts = new Map<string, number>()
        let myCount = 0

        for (let i = 0; i < recordCount; i++) {
          const offset = i * 48 // 24 bytes = 48 hex chars
          const ownerHex = '0x' + hex.slice(offset, offset + 40)
          if (ownerHex === '0x0000000000000000000000000000000000000000') continue

          const count = (ownerCounts.get(ownerHex.toLowerCase()) ?? 0) + 1
          ownerCounts.set(ownerHex.toLowerCase(), count)

          if (ownerHex.toLowerCase() === addrStr!.toLowerCase()) {
            myCount++
          }
        }

        setPixelCount(myCount)

        // Compute rank
        const sorted = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])
        const rankIdx = sorted.findIndex(([owner]) => owner === addrStr!.toLowerCase())
        setRank(rankIdx >= 0 ? rankIdx + 1 : 0)
      } catch (e) {
        console.warn('Failed to fetch pixel stats from contract:', e)
      }
    }

    fetchStats()

    // Fetch P&L from PixelsPurchased events across the full contract history.
    //
    // Strategy:
    //   1. Read the contract's `halvingStartTimestamp()` (the block-time of
    //      the first pixel sale, or 0 if none yet) and the current block's
    //      timestamp to back-estimate how many blocks ago that first sale
    //      happened. Celo post-L2 produces ~1 block / sec; using 1s here +
    //      a safety buffer guarantees we never miss the first sale. If the
    //      contract has had no sales, there's nothing to scan — bail out.
    //   2. Chunked + parallel getLogs from estimated-first-sale to head.
    //      Mirrors the pattern in useAnalytics — Forno occasionally rejects
    //      large windows, so we cap each chunk at 50k blocks.
    //   3. Stale-while-revalidate cache in localStorage: render whatever's
    //      cached immediately (even if expired) so the user sees numbers
    //      instantly, then refresh in the background. Skip the rescan only
    //      if the cached entry is still fresh.
    async function fetchPnL() {
      const CHUNK_BLOCKS = 50_000n
      const MAX_PARALLEL = 4
      const SAFETY_BUFFER_BLOCKS = 100_000n
      const CACHE_KEY = `mondeto-pnl:${mondetoAddress.toLowerCase()}:${addrStr!.toLowerCase()}`
      const CACHE_TTL_MS = 10 * 60_000

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; spent: string; earned: string }
          setSpent(BigInt(parsed.spent))
          setEarned(BigInt(parsed.earned))
          if (Date.now() - parsed.ts < CACHE_TTL_MS) return
        }
      } catch {}

      try {
        const { parseAbiItem } = await import('viem')
        // Multi-token PixelsPurchased — `token` is the second indexed
        // parameter as of contract v2.
        const event = parseAbiItem(
          'event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)',
        )

        const currentBlock = await publicClient!.getBlockNumber()

        // Estimate the first-sale block from the contract's own clock.
        let fromBlock = 0n
        try {
          const [halvingStartTs, head] = await Promise.all([
            publicClient!.readContract({
              address: mondetoAddress,
              abi: MONDETO_ABI,
              functionName: 'halvingStartTimestamp',
            }) as Promise<bigint>,
            publicClient!.getBlock({ blockNumber: currentBlock }),
          ])
          // 0 means no purchases yet — no logs to scan, and the initial
          // 0/0 P&L state set above is already correct.
          if (halvingStartTs === 0n) return
          const secondsSinceStart = head.timestamp - halvingStartTs
          // 1s/block on Celo L2 — overestimating is safe (fromBlock just
          // ends up earlier than needed and the empty chunks are cheap).
          const estimatedBlocks = secondsSinceStart + SAFETY_BUFFER_BLOCKS
          fromBlock = currentBlock > estimatedBlocks ? currentBlock - estimatedBlocks : 0n
        } catch (e) {
          console.warn('Could not read halvingStartTimestamp; scanning from block 0:', e)
        }

        // Build chunk ranges.
        const ranges: Array<{ from: bigint; to: bigint }> = []
        for (let start = fromBlock; start <= currentBlock; start += CHUNK_BLOCKS) {
          const end =
            start + CHUNK_BLOCKS - 1n > currentBlock
              ? currentBlock
              : start + CHUNK_BLOCKS - 1n
          ranges.push({ from: start, to: end })
        }

        // Run in parallel batches, polite to Forno.
        const client = publicClient!
        type Log = Awaited<ReturnType<typeof client.getLogs<typeof event>>>[number]
        const logs: Log[] = []
        for (let i = 0; i < ranges.length; i += MAX_PARALLEL) {
          const batch = ranges.slice(i, i + MAX_PARALLEL)
          const results = await Promise.allSettled(
            batch.map((r) =>
              publicClient!.getLogs({
                address: mondetoAddress,
                event,
                fromBlock: r.from,
                toBlock: r.to,
              }),
            ),
          )
          for (const r of results) {
            if (r.status === 'fulfilled') logs.push(...r.value)
            else console.warn('P&L chunk failed:', r.reason)
          }
        }

        // Sort chronologically so the running owner-of map reflects real
        // purchase order — chunks return in batch order but logs within a
        // chunk are block-ordered, and we want global block order to be
        // safe even when chunks come back interleaved.
        logs.sort((a, b) => {
          const ab = a.blockNumber ?? 0n
          const bb = b.blockNumber ?? 0n
          if (ab !== bb) return ab < bb ? -1 : 1
          const ai = a.logIndex ?? 0
          const bi = b.logIndex ?? 0
          return ai - bi
        })

        // Look up each unique payment token's decimals so we can normalize
        // mixed-token totalCost values into a single 6-decimal "$ microcents"
        // unit before summing. Without this, summing e18 USDm with e6 USDC
        // would land in nonsense magnitudes.
        const tokenDecimals = new Map<string, number>()
        const uniqueTokens = new Set<string>()
        for (const log of logs) {
          uniqueTokens.add((log.args.token as string).toLowerCase())
        }
        await Promise.all(
          [...uniqueTokens].map(async (token) => {
            try {
              const [, dec] = (await publicClient!.readContract({
                address: mondetoAddress,
                abi: MONDETO_ABI,
                functionName: 'tokenConfig',
                args: [token as `0x${string}`],
              })) as readonly [boolean, number]
              tokenDecimals.set(token, Number(dec))
            } catch {
              // Sensible fallback: 6-decimal stablecoin assumption.
              tokenDecimals.set(token, 6)
            }
          }),
        )

        // Normalize amount to 6 decimals (the unit `formatUSDT` displays).
        const toMicrocents = (cost: bigint, decimals: number): bigint => {
          if (decimals === 6) return cost
          if (decimals > 6) return cost / 10n ** BigInt(decimals - 6)
          return cost * 10n ** BigInt(6 - decimals)
        }

        const addr = addrStr!.toLowerCase()
        let totalSpent = 0n
        let totalEarned = 0n
        const ownerOf = new Map<string, string>()

        for (const log of logs) {
          const buyer = (log.args.buyer as string).toLowerCase()
          const tokenAddr = (log.args.token as string).toLowerCase()
          const ids = log.args.ids as bigint[]
          const totalCost = log.args.totalCost as bigint
          const normalized = toMicrocents(totalCost, tokenDecimals.get(tokenAddr) ?? 6)

          if (buyer === addr) {
            totalSpent += normalized
          }

          const perPixelCost = ids.length > 0 ? normalized / BigInt(ids.length) : 0n

          for (const id of ids) {
            const idStr = id.toString()
            const prevOwner = ownerOf.get(idStr)
            if (prevOwner === addr) {
              totalEarned += perPixelCost
            }
            ownerOf.set(idStr, buyer)
          }
        }

        setSpent(totalSpent)
        setEarned(totalEarned)

        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              ts: Date.now(),
              spent: totalSpent.toString(),
              earned: totalEarned.toString(),
            }),
          )
        } catch {}
      } catch (e) {
        console.warn('Failed to fetch P&L:', e)
      }
    }

    fetchPnL()
  }, [publicClient, addrStr, mondetoAddress])

  const saveLabel =
    saveState === 'saving' ? 'SAVING\u2026' :
    saveState === 'confirming' ? 'CONFIRMING\u2026' :
    saveState === 'saved' ? 'SAVED \u2713' :
    'SAVE'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 60 }}>
      <TopBar title="MONDETO" />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          paddingBottom: 56,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!addrStr && (
          <div
            style={{
              background: 'var(--card-bg)',
              border: '2px solid var(--brand-lime)',
              padding: '16px 18px',
              margin: '0 16px 16px',
              maxWidth: 460,
              width: 'calc(100% - 32px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "'Press Start 2P', monospace",
                letterSpacing: 2,
                color: 'var(--text)',
              }}
            >
              CONNECT TO PLAY
            </div>
            <div
              style={{
                fontSize: 7,
                fontFamily: "'Press Start 2P', monospace",
                letterSpacing: 1.5,
                lineHeight: 1.6,
                color: 'var(--text-muted)',
                maxWidth: 320,
              }}
            >
              link a wallet to claim pixels, set your color, and save your name on-chain
            </div>
            <ConnectButton />
          </div>
        )}
        <AvatarBlock color={color} name={name} />
        <StatsRow
          pixels={pixelCount}
          balance={formatBalanceForDisplay(walletBalance.preferred?.amount ?? walletBalance.totalAmount)}
          balanceSymbol={walletBalance.preferred?.symbol}
          rank={rank}
          spent={formatUSDT(spent)}
          earned={formatUSDT(earned)}
        />

        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
          {/* Name field */}
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 6, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 6 }}>
              NAME
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
              maxLength={32}
              placeholder="enter name..."
              style={{ fontSize: 10, fontFamily: "'Press Start 2P', monospace", letterSpacing: 1, color: 'var(--text)', background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
            />
          </div>

          {nameError && (
            <div
              style={{
                fontSize: 7,
                fontFamily: "'Press Start 2P', monospace",
                color: 'var(--error)',
                letterSpacing: 1,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              {nameError}
            </div>
          )}

          <ColorPicker color={color} onChange={setColor} />

          {/* Save button */}
          <button
            onClick={() => {
              const check = checkProfanity(name)
              if (!check.ok) {
                setNameError(check.reason ?? 'invalid name')
                return
              }
              setNameError(null)
              save()
            }}
            disabled={!addrStr || saveState === 'saving' || saveState === 'confirming'}
            className="pixel-btn pixel-btn-filled font-display"
            style={{
              display: 'block',
              margin: '16px 0 8px',
              width: '100%',
              fontSize: 10,
              letterSpacing: 2,
              padding: 12,
              opacity: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 0.5 : 1,
              cursor: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 'default' : 'pointer',
            }}
          >
            {saveLabel}
          </button>

          {/* Invite link — lands the invitee on this player's current map
              with their wallet as the referral code. */}
          <InviteButton />

          {/* Support + legal footer — boxed card so it reads as a distinct
              section. MiniPay requires Support / Terms / Privacy to be
              reachable in-app. Uses a 2px accent border so it pops in dark
              mode where card-bg is nearly identical to the page bg. */}
          <div
            style={{
              marginTop: 32,
              background: 'var(--card-bg)',
              border: '2px solid var(--text-muted)',
              borderRadius: 10,
              padding: '14px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 6,
                fontFamily: "'Press Start 2P', monospace",
                color: 'var(--text-muted)',
                letterSpacing: 2,
              }}
            >
              HELP &amp; LEGAL
            </div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('support_form_opened')}
              className="pixel-btn pixel-btn-filled font-display"
              style={{ fontSize: 9, letterSpacing: 2, padding: '8px 18px', textDecoration: 'none' }}
            >
              SUPPORT
            </a>
            <div
              style={{
                display: 'flex',
                gap: 18,
                paddingTop: 10,
                borderTop: '1px solid var(--text-muted)',
                width: '100%',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/faq"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                help
              </Link>
              <Link
                href="/terms"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                terms
              </Link>
              <Link
                href="/privacy"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                privacy
              </Link>
            </div>
          </div>
        </div>
      </div>
      <BottomNav activeRoute="/profile" />
    </div>
  )
}
