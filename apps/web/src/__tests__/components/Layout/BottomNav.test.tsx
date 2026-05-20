import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomNav from '@/components/Layout/BottomNav'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

const BRAND_LIME_RGB = 'rgb(167, 255, 5)'

describe('BottomNav', () => {
  it('renders three nav links with icon + label', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(screen.getByText('RANKS')).toBeInTheDocument()
    expect(screen.getByText('MAP')).toBeInTheDocument()
    expect(screen.getByText('PROFILE')).toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/ranks')
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/profile')
  })

  it('active route uses brand-lime label, top border, and full-opacity icon', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const links = screen.getAllByRole('link')

    // First link is /ranks — active.
    const activeLink = links[0]
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(activeLink.style.borderTop).toContain(BRAND_LIME_RGB)

    const activeImg = activeLink.querySelector('img')
    expect(activeImg).not.toBeNull()
    expect(activeImg!.style.opacity).toBe('1')

    const activeLabel = activeLink.querySelector('span')
    expect(activeLabel!.style.color).toBe(BRAND_LIME_RGB)

    // Second link is / (MAP) — inactive.
    const inactiveLink = links[1]
    expect(inactiveLink).not.toHaveAttribute('aria-current')
    const inactiveImg = inactiveLink.querySelector('img')
    expect(parseFloat(inactiveImg!.style.opacity)).toBeLessThan(1)
  })
})
