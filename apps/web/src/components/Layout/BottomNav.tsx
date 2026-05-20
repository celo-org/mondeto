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

// SVG icons in /brand/icons are hard-filled white. The active-state lime tint
// is applied via a CSS filter — see the comment in the JSX for the recipe.
const ACTIVE_FILTER = 'invert(86%) sepia(75%) saturate(2000%) hue-rotate(20deg) brightness(105%)'

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
        alignItems: 'center',
      }}
    >
      {navItems.map((item) => {
        const isActive = activeRoute === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              textDecoration: 'none',
            }}
          >
            <img
              src={item.icon}
              alt=""
              width={28}
              height={28}
              style={{
                imageRendering: 'pixelated' as const,
                filter: isActive ? ACTIVE_FILTER : 'none',
                opacity: isActive ? 1 : 0.85,
              }}
            />
          </Link>
        )
      })}
    </nav>
  )
}
