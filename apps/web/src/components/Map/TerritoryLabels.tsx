'use client'
import React, { useMemo } from 'react'
import { computeEmpires, idToXY } from '@/lib/pixelMath'
import { ZERO_ADDRESS } from '@/constants/map'
import { ownerDefaultColor } from '@/lib/colorUtils'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

interface TerritoryLabelsProps {
  pixelData: PixelView[]
  scale: number
  profilesMap?: Map<string, { label: string; url?: string; color?: string }>
}

interface LabelInfo {
  owner: string
  label: string
  color: string
  cx: number
  cy: number
  size: number
}

const MIN_CLUSTER = 10
const MIN_SCALE = 2.5
const COLLISION_PX = 20

// Gradually reveal more labels as user zooms in
function labelBudget(scale: number): number {
  if (scale < 4) return 2
  if (scale < 8) return 4
  if (scale < 15) return 6
  return 10
}

export default function TerritoryLabels({ pixelData, scale, profilesMap }: TerritoryLabelsProps) {
  const { width, height } = useCurrentMapMeta()
  const labels = useMemo(() => {
    if (scale < MIN_SCALE) return []

    // Build owner map for BFS
    const ownerMap = new Map<number, string>()
    for (let i = 0; i < pixelData.length; i++) {
      const px = pixelData[i]
      if (px.owner !== ZERO_ADDRESS) {
        ownerMap.set(i, px.owner.toLowerCase())
      }
    }

    const empires = computeEmpires(ownerMap, width, height)

    // Find largest cluster per owner
    const largestByOwner = new Map<string, typeof empires[0]>()
    for (const emp of empires) {
      const existing = largestByOwner.get(emp.owner)
      if (!existing || emp.size > existing.size) {
        largestByOwner.set(emp.owner, emp)
      }
    }

    // Build label array for qualifying clusters
    const result: LabelInfo[] = []
    for (const [owner, emp] of largestByOwner) {
      if (emp.size < MIN_CLUSTER) continue

      // Calculate centroid
      let sx = 0, sy = 0
      for (const id of emp.ids) {
        const { x, y } = idToXY(id, width)
        sx += x
        sy += y
      }
      const cx = sx / emp.size
      const cy = sy / emp.size

      // Only show owners who have set a profile name — skip raw addresses
      const profile = profilesMap?.get(owner)
      if (!profile?.label) continue
      const label = profile.label
      const color = profile?.color || pixelData[Array.from(emp.ids)[0]]?.color || ownerDefaultColor(owner)

      result.push({ owner, label, color, cx, cy, size: emp.size })
    }

    // Sort by size descending, take top N based on zoom level
    result.sort((a, b) => b.size - a.size)
    const top = result.slice(0, labelBudget(scale))

    // Collision avoidance: hide smaller label if within COLLISION_PX of larger
    const visible: LabelInfo[] = []
    for (const l of top) {
      const collides = visible.some(v => {
        const dx = (l.cx - v.cx) * scale
        const dy = (l.cy - v.cy) * scale
        return Math.sqrt(dx * dx + dy * dy) < COLLISION_PX
      })
      if (!collides) visible.push(l)
    }

    return visible
  }, [pixelData, scale, profilesMap, width, height])

  if (scale < MIN_SCALE) return null
  if (labels.length === 0) return null

  return (
    <>
      {labels.map(l => (
        <div
          key={l.owner}
          style={{
            position: 'absolute',
            left: l.cx,
            top: l.cy,
            transform: `translate(-50%, -50%) scale(${1 / scale})`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: 0.5,
            color: '#ffffff',
            textShadow: '0 0 3px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)',
            background: `${l.color}88`,
            padding: '1px 4px',
            borderRadius: 3,
            border: `1px solid ${l.color}`,
          }}
        >
          {l.label}
        </div>
      ))}
    </>
  )
}
