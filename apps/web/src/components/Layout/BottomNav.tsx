'use client'

import Link from 'next/link'

interface BottomNavProps {
  activeRoute: string
}

const navItems = [
  { label: 'RANKS',   href: '/ranks',   icon: '/brand/icons/trophy.svg' },
  { label: 'MAP',     href: '/',        icon: '/brand/icons/globe.svg'  },
  { label: 'PROFILE', href: '/profile', icon: '/brand/icons/users.svg'  },
]

const BRAND_LIME = '#A7FF05'
// White SVG → brand-lime via CSS filter (icons are hard-filled white).
const LIME_FILTER = 'invert(86%) sepia(75%) saturate(2000%) hue-rotate(20deg) brightness(105%)'

export default function BottomNav({ activeRoute }: BottomNavProps) {
  return (
    <nav
      className="theme-bar-bottom"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
      }}
    >
      {navItems.map((item) => {
        const isActive = activeRoute === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              borderTop: `2px solid ${isActive ? BRAND_LIME : 'transparent'}`,
              backgroundColor: isActive ? 'rgba(167, 255, 5, 0.28)' : 'transparent',
              transition: 'background-color 120ms ease',
            }}
          >
            <img
              src={item.icon}
              alt={item.label}
              width={28}
              height={28}
              style={{
                imageRendering: 'pixelated' as const,
                filter: isActive ? LIME_FILTER : 'none',
                opacity: isActive ? 1 : 0.7,
              }}
            />
          </Link>
        )
      })}
    </nav>
  )
}
