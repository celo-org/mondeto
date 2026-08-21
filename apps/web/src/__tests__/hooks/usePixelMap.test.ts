import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePixelMap } from '@/hooks/usePixelMap'
import { getMapContractById } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

// Map-mount lifecycle (map_mount_started / _completed / _failed) through the
// hook that owns the full-grid read. The three events are the measurement
// behind the MiniPay entry-freeze investigation: `completed / started` is the
// freeze rate, so every assertion here is about WHEN each fires, how many
// times, and against which map — not about the pixel data itself.

const h = vi.hoisted(() => ({
  track: vi.fn(),
  // Per-contract deferred for getPixelBatch, so a test can hold one map's read
  // open while another map's resolves (the stored-map restore race).
  batchReads: new Map<string, Deferred<string>>(),
  onBatchRead: null as null | ((address: string) => Promise<string>),
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => h.track(...args),
}))

// Honour the call: route by functionName and by contract address, so the
// fake can't hand map 0's bytes to map 1's read. The client object is ONE
// stable instance, like the real hook's memoised client — a fresh object per
// render would re-create `load` and re-issue the read on every render.
const readClient = {
  readContract: (args: { address: string; functionName: string }) => {
    if (args.functionName === 'getPixelBatch') {
      if (h.onBatchRead) return h.onBatchRead(args.address)
      let d = h.batchReads.get(args.address)
      if (!d) {
        d = deferred<string>()
        h.batchReads.set(args.address, d)
      }
      return d.promise
    }
    if (args.functionName === 'config') {
      // [width, height, halvingTime, initialPrice, minPrice, halvingStartTimestamp, feeRate]
      return Promise.resolve([170, 100, 86_400n, 1_000_000n, 10_000n, 0n, 500n])
    }
    return Promise.reject(new Error(`unexpected read ${args.functionName}`))
  },
}

vi.mock('@/hooks/useReadClient', () => ({
  useReadClient: () => readClient,
}))

// One packed land record (24 bytes = 48 hex chars): owner(20) saleCount(1)
// color(3) — the on-chain getPixelBatch layout. decodePixelBatch tolerates a
// truncated payload, so one record is a valid (tiny) grid read.
const OWNER_A = '11'.repeat(20)
const BATCH_HEX = '0x' + OWNER_A + '05' + 'a7ff05'

// A real viem transport failure, as seen from the browser when Forno rate
// limits. The first line is the human summary; the URL lives further down and
// must never travel to analytics.
const RATE_LIMIT_ERROR = new Error(
  'HTTP request failed.\n\nStatus: 429\nURL: https://forno.celo.org\nRequest body: {"method":"eth_call"}\n\nDetails: Too Many Requests\nVersion: viem@2.0.0',
)
RATE_LIMIT_ERROR.name = 'HttpRequestError'

const WORLD = getMapContractById(0 as MapId)
const AFRICA = getMapContractById(1 as MapId)

const RETRY_TOTAL_MS = 1500 + 4000 + 8000

const eventsNamed = (name: string) =>
  h.track.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>)
const eventOrder = () => h.track.mock.calls.map((c) => c[0] as string)

// Drain the promise chain (readContract → decode → setState) without moving
// the clock, so elapsedMs assertions stay exact.
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await flush()
}

beforeEach(() => {
  // Only the timers the hook uses (retry ladder, poll) and the clock the
  // events read. React's async act() drains via setImmediate — faking that
  // too leaves act() hanging until the test timeout.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.track.mockReset()
  h.batchReads.clear()
  h.onBatchRead = null
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePixelMap — map mount lifecycle', () => {
  it('fires map_mount_started before the grid read resolves, and completed only after it paints', async () => {
    const { result } = renderHook(() => usePixelMap(0 as MapId))
    await flush()

    // The read is still in flight: started has fired, completed has not.
    expect(eventsNamed('map_mount_started')).toEqual([{ mapId: 0, trigger: 'entry' }])
    expect(eventsNamed('map_mount_completed')).toHaveLength(0)
    expect(result.current.loadState).toBe('loading')

    await advance(1234)
    h.batchReads.get(WORLD.address)!.resolve(BATCH_HEX)
    await flush()

    expect(result.current.loadState).toBe('ready')
    expect(eventOrder()).toEqual(['map_mount_started', 'map_mount_completed'])
    expect(eventsNamed('map_mount_completed')).toEqual([
      { mapId: 0, trigger: 'entry', elapsedMs: 1234, attempts: 1 },
    ])
  })

  it('a stalled read produces started with no completed and no failed', async () => {
    renderHook(() => usePixelMap(0 as MapId))
    await flush()
    // Hold the read open well past every retry window — a hang is not a
    // failure and must not be filed as one.
    await advance(60_000)

    expect(eventOrder()).toEqual(['map_mount_started'])
  })

  it('completed fires exactly once — not per re-render, refresh or poll', async () => {
    const { result, rerender } = renderHook(() => usePixelMap(0 as MapId))
    await flush()
    h.batchReads.get(WORLD.address)!.resolve(BATCH_HEX)
    await flush()
    expect(eventsNamed('map_mount_completed')).toHaveLength(1)

    rerender()
    rerender()
    await act(async () => {
      await result.current.refresh()
    })
    await flush()
    // 30s poll tick — another successful full-grid read.
    await advance(30_000)

    expect(eventsNamed('map_mount_started')).toHaveLength(1)
    expect(eventsNamed('map_mount_completed')).toHaveLength(1)
  })

  // The RPC answer always lands in a later task than the request that set
  // loadState to 'loading'. Settling each read in its own act() keeps that
  // true here — a synchronous rejection would fold 'error' → 'loading' →
  // 'error' into one commit and the retry ladder would never re-arm.
  function perCallReads() {
    const calls: Deferred<string>[] = []
    h.onBatchRead = () => {
      const d = deferred<string>()
      calls.push(d)
      return d.promise
    }
    return {
      calls,
      rejectLatest: async () => {
        calls[calls.length - 1].reject(RATE_LIMIT_ERROR)
        await flush()
      },
      resolveLatest: async () => {
        calls[calls.length - 1].resolve(BATCH_HEX)
        await flush()
      },
    }
  }

  it('a read that fails every retry fires map_mount_failed once, with a category and no URL, and never completed', async () => {
    const reads = perCallReads()
    const { result } = renderHook(() => usePixelMap(0 as MapId))
    await flush()
    await reads.rejectLatest()

    expect(result.current.loadState).toBe('error')
    // First failure is not terminal — the bounded retry ladder is still
    // running. Walk it rung by rung and assert nothing is filed until the
    // last rung has also failed.
    expect(eventsNamed('map_mount_failed')).toHaveLength(0)
    await advance(1500)
    await reads.rejectLatest()
    expect(eventsNamed('map_mount_failed')).toHaveLength(0)
    await advance(4000)
    await reads.rejectLatest()
    expect(eventsNamed('map_mount_failed')).toHaveLength(0)
    await advance(8000)
    await reads.rejectLatest()

    expect(reads.calls).toHaveLength(4)
    expect(eventsNamed('map_mount_completed')).toHaveLength(0)
    const failed = eventsNamed('map_mount_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      mapId: 0,
      trigger: 'entry',
      attempts: 4,
      category: 'rpc',
      detail: 'HttpRequestError: HTTP request failed.',
    })
    expect(failed[0].elapsedMs).toBe(RETRY_TOTAL_MS)
    expect(String(failed[0].detail)).not.toContain('https://')

    // Terminal means terminal: more time passes, nothing re-fires.
    await advance(60_000)
    expect(eventsNamed('map_mount_failed')).toHaveLength(1)
    expect(eventOrder()).toEqual(['map_mount_started', 'map_mount_failed'])
  })

  it('a read that fails once and recovers on retry completes (with the attempt count) and does not fail', async () => {
    const reads = perCallReads()
    renderHook(() => usePixelMap(0 as MapId))
    await flush()
    await reads.rejectLatest()
    expect(eventsNamed('map_mount_completed')).toHaveLength(0)

    await advance(1500)
    await reads.resolveLatest()

    expect(reads.calls).toHaveLength(2)
    expect(eventsNamed('map_mount_failed')).toHaveLength(0)
    expect(eventsNamed('map_mount_completed')).toEqual([
      { mapId: 0, trigger: 'entry', elapsedMs: 1500, attempts: 2 },
    ])
  })

  it('switching maps after the entry completed starts a new mount with trigger=switch', async () => {
    const { rerender } = renderHook(({ mapId }) => usePixelMap(mapId), {
      initialProps: { mapId: 0 as MapId },
    })
    await flush()
    h.batchReads.get(WORLD.address)!.resolve(BATCH_HEX)
    await flush()

    rerender({ mapId: 1 as MapId })
    await flush()
    expect(eventsNamed('map_mount_started')).toEqual([
      { mapId: 0, trigger: 'entry' },
      { mapId: 1, trigger: 'switch' },
    ])
    expect(eventsNamed('map_mount_completed')).toHaveLength(1)

    await advance(250)
    h.batchReads.get(AFRICA.address)!.resolve(BATCH_HEX)
    await flush()

    expect(eventsNamed('map_mount_completed')).toEqual([
      { mapId: 0, trigger: 'entry', elapsedMs: 0, attempts: 1 },
      { mapId: 1, trigger: 'switch', elapsedMs: 250, attempts: 1 },
    ])
  })

  it('a switch before the entry completes keeps one mount and ignores the superseded read', async () => {
    // This is the stored-map restore on every returning continent player: the
    // hook mounts on map 0, the provider restores map 1 one effect later.
    const { rerender } = renderHook(({ mapId }) => usePixelMap(mapId), {
      initialProps: { mapId: 0 as MapId },
    })
    await flush()
    await advance(100)
    rerender({ mapId: 1 as MapId })
    await flush()

    // One entry mount, not two starts.
    expect(eventsNamed('map_mount_started')).toEqual([{ mapId: 0, trigger: 'entry' }])

    // The map-0 read lands late. It must not count as this mount completing.
    h.batchReads.get(WORLD.address)!.resolve(BATCH_HEX)
    await flush()
    expect(eventsNamed('map_mount_completed')).toHaveLength(0)

    await advance(400)
    h.batchReads.get(AFRICA.address)!.resolve(BATCH_HEX)
    await flush()
    expect(eventsNamed('map_mount_completed')).toEqual([
      { mapId: 1, trigger: 'entry', elapsedMs: 500, attempts: 1 },
    ])
  })
})
