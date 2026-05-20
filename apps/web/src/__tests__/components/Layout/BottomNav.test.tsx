import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomNav from '@/components/Layout/BottomNav'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

const BRAND_LIME_RGB = 'rgb(167, 255, 5)'

describe('BottomNav', () => {
  it('renders three icon-only nav links', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    // No visible text labels — icons only.
    expect(screen.queryByText('RANKS')).toBeNull()
    expect(screen.queryByText('MAP')).toBeNull()
    expect(screen.queryByText('PROFILE')).toBeNull()
  })

  it('aria-labels remain so screen readers can name each route', () => {
    render(<BottomNav activeRoute="/" />)
    expect(screen.getByLabelText('RANKS')).toBeInTheDocument()
    expect(screen.getByLabelText('MAP')).toBeInTheDocument()
    expect(screen.getByLabelText('PROFILE')).toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/ranks')
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/profile')
  })

  it('active route has brand-lime top border + tinted background + full-opacity icon', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const links = screen.getAllByRole('link')

    const activeLink = links[0]
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(activeLink.style.borderTop).toContain(BRAND_LIME_RGB)
    expect(activeLink.style.backgroundColor.replace(/\s/g, '')).toMatch(/rgba\(167,255,5,/)

    const activeImg = activeLink.querySelector('img')
    expect(activeImg).not.toBeNull()
    expect(activeImg!.style.opacity).toBe('1')

    const inactiveLink = links[1]
    expect(inactiveLink).not.toHaveAttribute('aria-current')
    const inactiveImg = inactiveLink.querySelector('img')
    expect(parseFloat(inactiveImg!.style.opacity)).toBeLessThan(1)
  })
})
