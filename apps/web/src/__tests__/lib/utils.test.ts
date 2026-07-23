import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('joins truthy class values', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy / conditional values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('flattens array inputs (clsx)', () => {
    expect(cn(['a', 'b'])).toBe('a b')
  })

  it('resolves conflicting Tailwind utilities, last one wins (twMerge)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })
})
