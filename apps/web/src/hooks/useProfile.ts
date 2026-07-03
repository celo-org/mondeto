'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { MONDETO_ABI } from '@/lib/contract'
import { uint24ToHex, hexToUint24, ownerDefaultColor } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'
import { getAttributionSuffix } from '@/lib/attribution'
import { getContractByMapId } from '@/lib/maps/contracts'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

// Deterministic per-address default color, shared with the map renderer so
// the profile seed and the on-map fallback stay in sync. See
// `ownerDefaultColor` in lib/colorUtils.
const defaultColorFor = ownerDefaultColor

// The user's picked color is persisted locally per address. A wallet's color
// is part of its identity and should look the same on the profile screen and
// on the map (own pixels) the moment it's picked — before the on-chain save
// confirms, and across page navigations where each `useProfile` instance is
// separate. On-chain color still overrides this for display once saved.
const PICKED_COLOR_KEY = 'mondeto-picked-color'

function readPickedColor(address: string | undefined): string | null {
  if (!address || typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(`${PICKED_COLOR_KEY}:${address.toLowerCase()}`)
  } catch {
    return null
  }
}

function writePickedColor(address: string | undefined, color: string): void {
  if (!address || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PICKED_COLOR_KEY}:${address.toLowerCase()}`, color)
  } catch {
    // localStorage unavailable (private mode) — picked color just won't
    // persist across navigations; the session still works.
  }
}

export type ProfileSaveState = 'idle' | 'saving' | 'confirming' | 'saved' | 'error'

export function useProfile(address: string | undefined, mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColorState] = useState<string>(
    () => readPickedColor(address) ?? defaultColorFor(address),
  )
  const [saveState, setSaveState] = useState<ProfileSaveState>('idle')

  // UI color setter: persist the pick so the map (own pixels) and other
  // screens reflect it immediately, even before the on-chain save.
  const setColor = useCallback(
    (c: string) => {
      setColorState(c)
      writePickedColor(address, c)
    },
    [address],
  )

  // Re-seed when the address changes: the locally-picked color if there is
  // one, else the deterministic default. The contract-data effect below
  // still overrides this when an on-chain color is set.
  useEffect(() => {
    if (address) setColorState(readPickedColor(address) ?? defaultColorFor(address))
  }, [address])

  // Read profile from contract
  const { data: profileData } = useReadContract({
    address: contractAddress,
    abi: MONDETO_ABI,
    functionName: 'profiles',
    args: [(address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`],
    query: { enabled: !!address },
  })

  // Load profile data when it arrives. When the on-chain label is empty
  // we fall back to a deterministic generated username so the user always
  // has something to display (and to save) without seeing a raw 0x… first.
  useEffect(() => {
    if (!profileData) return
    const [contractColor, labelBytes, urlBytes] = profileData as [number, unknown, unknown]
    // Display the saved on-chain color, but don't overwrite the user's
    // locally-stored pick — that stays their explicit intent.
    if (contractColor) setColorState(uint24ToHex(contractColor))
    const label = decodeBytes(labelBytes)
    const url = decodeBytes(urlBytes)
    if (label) setName(label)
    else if (address) setName(generateUsername(address))
    if (url) setUrl(url)
  }, [profileData, address])

  // Write profile to contract
  const { writeContract, data: txHash, isPending } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Track tx states
  useEffect(() => {
    if (isPending) setSaveState('saving')
    else if (isConfirming) setSaveState('confirming')
    else if (isSuccess) {
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    }
  }, [isPending, isConfirming, isSuccess])

  const save = useCallback(async () => {
    if (!name.trim()) return
    if (!address) {
      setSaveState('error')
      return
    }

    try {
      writeContract({
        address: contractAddress,
        abi: MONDETO_ABI,
        functionName: 'updateProfile',
        args: [hexToUint24(color), name, url],
        dataSuffix: getAttributionSuffix(),
      })
    } catch {
      setSaveState('error')
    }
  }, [address, name, url, color, writeContract])

  return { name, setName, url, setUrl, color, setColor, saveState, save }
}
