'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { MONDETO_ABI } from '@/lib/contract'
import { uint24ToHex, hexToUint24 } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'
import { getBuilderCodeSuffix } from '@/lib/builderCode'
import { getContractByMapId } from '@/lib/maps/contracts'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

export type ProfileSaveState = 'idle' | 'saving' | 'confirming' | 'saved' | 'error'

export function useProfile(address: Address | undefined, mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#e74c3c')
  const [saveState, setSaveState] = useState<ProfileSaveState>('idle')

  // Read profile from contract
  const { data: profileData } = useReadContract({
    address: contractAddress,
    abi: MONDETO_ABI,
    functionName: 'profiles',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  })

  // Load profile data when it arrives. When the on-chain label is empty
  // we fall back to a deterministic generated username so the user always
  // has something to display (and to save) without seeing a raw 0x… first.
  useEffect(() => {
    if (!profileData) return
    const [contractColor, labelBytes] = profileData as [number, unknown, unknown]
    if (contractColor) setColor(uint24ToHex(contractColor))
    const label = decodeBytes(labelBytes)
    if (label) setName(label)
    else if (address) setName(generateUsername(address))
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
        args: [hexToUint24(color), name, ''],
        dataSuffix: getBuilderCodeSuffix(),
      })
    } catch {
      setSaveState('error')
    }
  }, [address, name, color, writeContract, contractAddress])

  return { name, setName, color, setColor, saveState, save }
}
