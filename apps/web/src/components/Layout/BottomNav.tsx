'use client'

import Link from 'next/link'

interface BottomNavProps {
  activeRoute: string
}

// Two-asset swap: white SVG for inactive, pre-colored brand-green SVG for
// active. Both files live in /apps/web/public/brand/icons/.
const navItems = [
  { label: 'RANKS',   href: '/ranks',   icon: '/brand/icons/trophy.svg', iconActive: '/brand/icons/trophy_green.svg' },
  { label: 'MAP',     href: '/',        icon: '/brand/icons/globe.svg',  iconActive: '/brand/icons/globe_green.svg'  },
  { label: 'PROFILE', href: '/profile', icon: '/brand/icons/users.svg',  iconActive: '/brand/icons/users_green.svg'  },
]

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
            }}
          >
            <img
              src={isActive ? item.iconActive : item.icon}
              alt={item.label}
              width={28}
              height={28}
              style={{
                imageRendering: 'pixelated' as const,
                opacity: isActive ? 1 : 0.7,
              }}
            />
          </Link>
        )
      })}
    </nav>
  )
}
