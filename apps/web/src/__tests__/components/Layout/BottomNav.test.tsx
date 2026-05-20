import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomNav from '@/components/Layout/BottomNav'

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

describe('BottomNav', () => {
  it('renders three nav links (icons only, no text labels)', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
  })

  it('links point to correct routes', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/ranks')
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/profile')
  })

  it('active route icon is rendered full-opacity', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const links = screen.getAllByRole('link')
    // First link is /ranks — active, opacity 1.
    const activeImg = links[0].querySelector('img')
    expect(activeImg).not.toBeNull()
    expect(activeImg!.style.opacity).toBe('1')

    // Second link is / (MAP) — inactive, opacity dimmed.
    const inactiveImg = links[1].querySelector('img')
    expect(inactiveImg!.style.opacity).toBe('0.85')
  })
})
