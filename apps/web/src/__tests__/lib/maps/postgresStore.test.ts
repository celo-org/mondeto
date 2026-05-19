import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock @vercel/postgres before importing the module under test. We expose
// `sql` as a tagged-template function so the store can call it normally,
// and back it with an in-memory table the assertions can inspect.
const tableAssignments = new Map<string, number>()
const sqlCalls: { strings: TemplateStringsArray; values: unknown[] }[] = []

interface PgRow {
  map_id?: number
}

interface PgResult {
  rows: PgRow[]
}

function runSql(
  strings: TemplateStringsArray,
  values: unknown[],
): PgResult {
  const sqlText = strings.join('?').toLowerCase()

  if (sqlText.includes('select map_id') && sqlText.includes('from assignments')) {
    const address = values[0] as string
    const mapId = tableAssignments.get(address)
    if (mapId === undefined) return { rows: [] }
    return { rows: [{ map_id: mapId }] }
  }

  if (sqlText.includes('insert into assignments')) {
    const [address, mapId] = values as [string, number]
    // INSERT ... ON CONFLICT DO NOTHING semantics.
    if (!tableAssignments.has(address)) {
      tableAssignments.set(address, mapId)
    }
    return { rows: [] }
  }

  throw new Error(`Unhandled SQL in test mock: ${sqlText}`)
}

vi.mock('@vercel/postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    sqlCalls.push({ strings, values })
    return Promise.resolve(runSql(strings, values))
  },
}))

// Import AFTER the mock is registered so the store binds to the mock.
import { postgresAssignmentStore } from '@/lib/maps/postgresStore'

describe('postgresAssignmentStore', () => {
  beforeEach(() => {
    tableAssignments.clear()
    sqlCalls.length = 0
  })

  it('returns null when the address has never been seen', async () => {
    const result = await postgresAssignmentStore.get('0xabc')
    expect(result).toBeNull()
  })

  it('writes a row on first set and reads it back', async () => {
    await postgresAssignmentStore.set('0xabc', 3)
    expect(tableAssignments.get('0xabc')).toBe(3)
    const result = await postgresAssignmentStore.get('0xabc')
    expect(result).toBe(3)
  })

  it('is sticky: a second set on the same address is a no-op', async () => {
    await postgresAssignmentStore.set('0xabc', 3)
    await postgresAssignmentStore.set('0xabc', 7)
    expect(tableAssignments.get('0xabc')).toBe(3)
    expect(await postgresAssignmentStore.get('0xabc')).toBe(3)
  })

  it('lowercases the address on write', async () => {
    await postgresAssignmentStore.set('0xDEADbeef', 5)
    expect(tableAssignments.has('0xdeadbeef')).toBe(true)
    expect(tableAssignments.has('0xDEADbeef')).toBe(false)
  })

  it('lowercases the address on read', async () => {
    tableAssignments.set('0xdeadbeef', 5)
    const result = await postgresAssignmentStore.get('0xDEADBEEF')
    expect(result).toBe(5)
  })

  it('uses parameterised queries (no string interpolation of the address)', async () => {
    await postgresAssignmentStore.set('0xabc', 1)
    // The address is passed as a value, not concatenated into the SQL text.
    const insertCall = sqlCalls.find((c) =>
      c.strings.join('?').toLowerCase().includes('insert into assignments'),
    )
    expect(insertCall).toBeDefined()
    expect(insertCall!.values).toEqual(['0xabc', 1])
  })
})
