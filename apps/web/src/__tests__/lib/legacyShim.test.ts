import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { LEGACY_SHIM } from '@/lib/legacyShim'

/**
 * The shim ships as a string inlined into <head>, so a plain import can't
 * exercise it. Each case builds a fresh VM context, deletes the natives to
 * simulate Chrome 80, evaluates the exact string we inline, and asserts the
 * replacement behaves — which is also what catches a bad backslash in the
 * escaping, the one thing a string-typed patch can silently get wrong.
 */
function runOnLegacyEngine(expression: string): unknown {
  const context = vm.createContext({})
  vm.runInContext(
    'delete Object.hasOwn; delete String.prototype.replaceAll;',
    context,
  )
  vm.runInContext(LEGACY_SHIM, context)
  return vm.runInContext(expression, context)
}

describe('LEGACY_SHIM on an engine missing both APIs', () => {
  it('installs Object.hasOwn', () => {
    expect(runOnLegacyEngine('typeof Object.hasOwn')).toBe('function')
  })

  it('Object.hasOwn reports own properties', () => {
    expect(runOnLegacyEngine('Object.hasOwn({ a: 1 }, "a")')).toBe(true)
  })

  it('Object.hasOwn ignores inherited properties', () => {
    expect(runOnLegacyEngine('Object.hasOwn({}, "toString")')).toBe(false)
  })

  it('Object.hasOwn works on array indices', () => {
    expect(runOnLegacyEngine('Object.hasOwn(["x"], 0)')).toBe(true)
    expect(runOnLegacyEngine('Object.hasOwn(["x"], 1)')).toBe(false)
  })

  it('installs String.prototype.replaceAll', () => {
    expect(runOnLegacyEngine('typeof "".replaceAll')).toBe('function')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(runOnLegacyEngine('"a-b-c".replaceAll("-", "+")')).toBe('a+b+c')
  })

  it('treats the needle literally rather than as a pattern', () => {
    // Without escaping, "." would match every character.
    expect(runOnLegacyEngine('"a.b.c".replaceAll(".", "-")')).toBe('a-b-c')
  })

  it('escapes regex metacharacters in the needle', () => {
    expect(runOnLegacyEngine('"1+1=2".replaceAll("+", " plus ")')).toBe(
      '1 plus 1=2',
    )
    expect(runOnLegacyEngine('"a(b)c".replaceAll("(b)", "B")')).toBe('aBc')
  })

  it('keeps $& substitution semantics', () => {
    expect(runOnLegacyEngine('"ab".replaceAll("a", "[$&]")')).toBe('[a]b')
  })

  it('supports a function replacer', () => {
    expect(
      runOnLegacyEngine('"a-a".replaceAll("a", function (m) { return m.toUpperCase() })'),
    ).toBe('A-A')
  })

  it('accepts a global RegExp', () => {
    expect(runOnLegacyEngine('"a1b2".replaceAll(/[0-9]/g, "#")')).toBe('a#b#')
  })

  it('rejects a non-global RegExp, as the spec requires', () => {
    // Matched by message, not `toThrow(TypeError)`: the error is constructed
    // inside the VM realm, so it fails an instanceof against the host's.
    expect(() => runOnLegacyEngine('"a1".replaceAll(/[0-9]/, "#")')).toThrow(
      /must be called with a global RegExp/,
    )
  })

  it('returns the string unchanged when the needle is absent', () => {
    expect(runOnLegacyEngine('"abc".replaceAll("z", "!")')).toBe('abc')
  })
})

describe('LEGACY_SHIM on a modern engine', () => {
  it('leaves the native implementations in place', () => {
    const context = vm.createContext({})
    const nativeHasOwn = vm.runInContext('Object.hasOwn', context)
    vm.runInContext(LEGACY_SHIM, context)
    expect(vm.runInContext('Object.hasOwn', context)).toBe(nativeHasOwn)
  })

  it('is ES5-only so it cannot itself throw on the engines it targets', () => {
    expect(LEGACY_SHIM).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })
})
