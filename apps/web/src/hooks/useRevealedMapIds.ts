'use client'

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { defaultRevealedMapIdsClient } from '@/lib/maps/reveals'

/**
 * Runtime "which maps are revealed" for client code.
 *
 * The value comes from `/api/reveals` (Edge Config, written by the admin
 * board) so toggling a continent open takes effect live — no redeploy. Until
 * the fetch resolves we use the build-time default (env var, else WORLD).
 */
const RevealedMapIdsContext = createContext<number[]>([0])

export function RevealsProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>(() => defaultRevealedMapIdsClient())

  useEffect(() => {
    let cancelled = false
    fetch('/api/reveals')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d?.ids)) {
          const clean = d.ids
            .map((n: unknown) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 0)
          if (clean.length > 0) setIds(clean)
        }
      })
      .catch(() => {
        // Keep the default — reveals just won't reflect a live Edge Config
        // change until the next successful fetch.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return createElement(RevealedMapIdsContext.Provider, { value: ids }, children)
}

export function useRevealedMapIds(): number[] {
  return useContext(RevealedMapIdsContext)
}
