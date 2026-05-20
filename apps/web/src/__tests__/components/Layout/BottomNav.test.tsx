import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomNav from '@/components/Layout/BottomNav'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

describe('BottomNav', () => {
  it('renders three icon-only nav links', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
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

  it('active route swaps to the *_green.svg icon variant; inactive icons keep the default white asset and dim', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const links = screen.getAllByRole('link')

    const activeLink = links[0]
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    const activeImg = activeLink.querySelector('img')
    expect(activeImg).not.toBeNull()
    expect(activeImg!.getAttribute('src')).toBe('/brand/icons/trophy_green.svg')
    expect(activeImg!.style.opacity).toBe('1')

    const inactiveLink = links[1]
    expect(inactiveLink).not.toHaveAttribute('aria-current')
    const inactiveImg = inactiveLink.querySelector('img')
    expect(inactiveImg!.getAttribute('src')).toBe('/brand/icons/globe.svg')
    expect(parseFloat(inactiveImg!.style.opacity)).toBeLessThan(1)
  })

  it('active route does not paint a background tint or border on its tile', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const activeLink = screen.getAllByRole('link')[0]
    expect(activeLink.style.backgroundColor).toBe('')
    expect(activeLink.style.borderTop).toBe('')
  })
})
