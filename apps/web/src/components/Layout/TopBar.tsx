'use client'

import React from 'react'
import Link from 'next/link'
import { ConnectButton } from '@/components/connect-button'
import MapSwitcher from '@/components/Layout/MapSwitcher'

interface TopBarProps {
  title: string
  children?: React.ReactNode
}

export default function TopBar({ title, children }: TopBarProps) {
  return (
    <div
      className="theme-bar-top"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        // Stays above PaintModeBanner (zIndex 15) so the ConnectButton's
        // PROFILE / LOG OUT dropdown isn't covered when zoomed into the map.
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        gap: 8,
      }}
    >
      <Link
        href="/"
        aria-label={title}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        <img
          src="/brand/logo/logo.svg"
          alt=""
          width={28}
          height={28}
          style={{ imageRendering: 'pixelated' as const, display: 'block' }}
        />
        <img
          src="/brand/wordmark/wordmark-white.svg"
          alt={title}
          height={14}
          style={{ height: 14, display: 'block' }}
        />
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapSwitcher />
        {children}
        <ConnectButton />
      </div>
    </div>
  )
}
