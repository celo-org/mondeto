'use client'

import { useState } from 'react'
import { useReadContract, useAccount } from 'wagmi'
import { MONDETO_ABI, MONDETO_ADDRESS } from '@/lib/contract'
import { ConnectButton } from '@/components/connect-button'

const CONTRACT = { address: MONDETO_ADDRESS, abi: MONDETO_ABI } as const

export default function TestContractPage() {
  const { address, isConnected, chain } = useAccount()
  const [batchResult, setBatchResult] = useState<string>('')

  // 1. config()
  const config = useReadContract({
    ...CONTRACT,
    functionName: 'config',
  })

  // 2. isLand(42, 0) — should be true (first land pixel we found)
  const isLand = useReadContract({
    ...CONTRACT,
    functionName: 'isLand',
    args: [42, 0],
  })

  // 3. isLand(0, 0) — should be false (water)
  const isWater = useReadContract({
    ...CONTRACT,
    functionName: 'isLand',
    args: [0, 0],
  })

  // 3b. isLand(87, 40) — the pixel that failed buyPixels with NotLand
  const isLand8740 = useReadContract({
    ...CONTRACT,
    functionName: 'isLand',
    args: [87, 40],
  })

  // 4. priceOf(42, 0) — price of first land pixel
  const price = useReadContract({
    ...CONTRACT,
    functionName: 'priceOf',
    args: [42, 0],
  })

  // 5. currentEpoch
  const epoch = useReadContract({
    ...CONTRACT,
    functionName: 'currentEpoch',
  })

  // 6. pixels(42) — ownership of pixel ID 42
  const pixel = useReadContract({
    ...CONTRACT,
    functionName: 'pixels',
    args: [42n],
  })

  // 7. WIDTH + HEIGHT
  const width = useReadContract({ ...CONTRACT, functionName: 'WIDTH' })
  const height = useReadContract({ ...CONTRACT, functionName: 'HEIGHT' })

  // 8. getPixelBatch — small 5x5 area
  const batch = useReadContract({
    ...CONTRACT,
    functionName: 'getPixelBatch',
    args: [40, 0, 5, 5],
  })

  // 9. selectionPrice for a few land pixels
  const selPrice = useReadContract({
    ...CONTRACT,
    functionName: 'selectionPrice',
    args: [[42n, 43n, 44n]],
  })

  // 10. profiles — check if connected user has a profile
  const profile = useReadContract({
    ...CONTRACT,
    functionName: 'profiles',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  })

  const Row = ({ label, data, error, isLoading }: { label: string; data: unknown; error: unknown; isLoading: boolean }) => (
    <tr style={{ borderBottom: '1px solid #e0d8ce' }}>
      <td style={{ padding: 8, fontWeight: 500, verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
        {isLoading ? '⏳ loading...' :
         error ? <span style={{ color: '#e74c3c' }}>❌ {(error as Error).message?.slice(0, 100)}</span> :
         data === undefined ? '—' :
         typeof data === 'bigint' ? data.toString() :
         typeof data === 'boolean' ? (data ? '✅ true' : '❌ false') :
         Array.isArray(data) ? data.map((v, i) => <div key={i}>{typeof v === 'bigint' ? v.toString() : String(v)}</div>) :
         typeof data === 'object' ? JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) :
         String(data)}
      </td>
    </tr>
  )

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 16, marginBottom: 8 }}>Contract Test Page</h1>
      <p style={{ fontSize: 10, color: '#a09080', marginBottom: 12 }}>
        Proxy: {MONDETO_ADDRESS}<br />
        Chain: {chain?.name ?? 'not connected'} (ID: {chain?.id ?? '—'})
      </p>

      <div style={{ marginBottom: 16 }}>
        <ConnectButton />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #2d2520' }}>
            <th style={{ padding: 8, textAlign: 'left', width: '30%' }}>Endpoint</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Result</th>
          </tr>
        </thead>
        <tbody>
          <Row label="config()" data={config.data} error={config.error} isLoading={config.isLoading} />
          <Row label="WIDTH" data={width.data} error={width.error} isLoading={width.isLoading} />
          <Row label="HEIGHT" data={height.data} error={height.error} isLoading={height.isLoading} />
          <Row label="currentEpoch()" data={epoch.data} error={epoch.error} isLoading={epoch.isLoading} />
          <Row label="isLand(42, 0)" data={isLand.data} error={isLand.error} isLoading={isLand.isLoading} />
          <Row label="isLand(0, 0) [water]" data={isWater.data} error={isWater.error} isLoading={isWater.isLoading} />
          <Row label="isLand(87, 40) [failed pixel]" data={isLand8740.data} error={isLand8740.error} isLoading={isLand8740.isLoading} />
          <Row label="priceOf(42, 0)" data={price.data} error={price.error} isLoading={price.isLoading} />
          <Row label="pixels(42)" data={pixel.data} error={pixel.error} isLoading={pixel.isLoading} />
          <Row label="selectionPrice([42,43,44])" data={selPrice.data} error={selPrice.error} isLoading={selPrice.isLoading} />
          <Row label="getPixelBatch(40,0,5,5)" data={batch.data ? `${(batch.data as string).length / 2 - 1} bytes` : undefined} error={batch.error} isLoading={batch.isLoading} />
          <Row label={`profiles(${address?.slice(0, 8) ?? '—'}...)`} data={profile.data} error={profile.error} isLoading={profile.isLoading} />
        </tbody>
      </table>

      <p style={{ fontSize: 9, color: '#a09080', marginTop: 16 }}>
        If all rows show data (not errors), the contract integration is ready.
        Make sure your wallet is on Celo mainnet.
      </p>
    </div>
  )
}
