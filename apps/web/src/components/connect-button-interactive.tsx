"use client";

import { useConnectWallet } from "@privy-io/react-auth";
import { useAccount, useDisconnect } from "wagmi";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generateUsername } from "@/lib/username";
import { useProfile } from "@/hooks/useProfile";
import { useMaps } from "@/hooks/useMaps";
import { buttonClassName, buttonStyle } from "./connect-button-styles";

/**
 * The half of ConnectButton that talks to Privy.
 *
 * Split into its own module purely for bundling. `connect-button.tsx` is
 * mounted by `TopBar` on every page, so anything it imports statically lands
 * in the shared chunk — and `@privy-io/react-auth` carries `x402` and
 * `@solana/kit` with it. MiniPay clients never render this component (they
 * get the injected connector and `PrivyReadyContext` stays `false`), so they
 * should never download it either. `connect-button.tsx` pulls this in with
 * `next/dynamic({ ssr: false })`.
 *
 * `useConnectWallet` also requires `PrivyProvider` to be an ancestor at the
 * moment it runs, so this must only ever be rendered under `PrivyTree`.
 */
export default function ConnectButtonInteractive() {
  const { connectWallet } = useConnectWallet();
  const { disconnect } = useDisconnect();
  const { isConnected, address } = useAccount();
  const { currentMapId } = useMaps();
  const { name: onChainName } = useProfile(address, currentMapId);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const username =
    isConnected && address ? onChainName || generateUsername(address) : null;

  const label = isConnected ? username ?? "…" : "CONNECT";

  const onClick = () => {
    if (isConnected) setMenuOpen((o) => !o);
    else connectWallet();
  };

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    fontSize: 8,
    fontFamily: "'Press Start 2P', monospace",
    letterSpacing: 1.5,
    color: "var(--text)",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button onClick={onClick} className={buttonClassName} style={buttonStyle}>
        {label}
      </button>
      {menuOpen && isConnected && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            minWidth: 140,
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            style={{ ...itemStyle, borderBottom: "1px solid var(--border)" }}
          >
            PROFILE
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            style={itemStyle}
          >
            LOG OUT
          </button>
        </div>
      )}
    </div>
  );
}
