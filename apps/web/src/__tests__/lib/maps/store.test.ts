import { describe, it, expect, beforeEach } from 'vitest'
import { memoryAssignmentStore } from '@/lib/maps/store'

describe('memoryAssignmentStore', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  it('returns null for an unknown address', () => {
    expect(memoryAssignmentStore.get('0xunknown')).toBeNull()
  })

  it('round-trips an assignment within a session', () => {
    memoryAssignmentStore.set('0xabc', 3)
    expect(memoryAssignmentStore.get('0xabc')).toBe(3)
  })

  it('persists across simulated reload via localStorage', () => {
    memoryAssignmentStore.set('0xpersist', 5)
    // Reading direct from storage proves the value left the in-memory Map.
    const raw = window.localStorage.getItem('mondeto-home:0xpersist')
    expect(raw).toBe('5')
  })

  it('normalises addresses to lowercase', () => {
    memoryAssignmentStore.set('0xAbCdEf', 2)
    expect(memoryAssignmentStore.get('0xabcdef')).toBe(2)
    expect(memoryAssignmentStore.get('0xABCDEF')).toBe(2)
  })
})
