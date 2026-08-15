"use client";

import { useConnectWallet } from "@privy-io/react-auth";
import { useAccount, useDisconnect } from "wagmi";
import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generateUsername } from "@/lib/username";
import { useProfile } from "@/hooks/useProfile";
import { useMaps } from "@/hooks/useMaps";
import { PrivyReadyContext } from "./wallet-provider-privy";

const buttonClassName = "pixel-btn pixel-btn-sm font-display";
const buttonStyle: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: 1.5,
  minWidth: 108,
  padding: "0 10px",
  justifyContent: "center",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function ConnectButtonPlaceholder() {
  return (
    <div style={{ position: "relative" }}>
      <button className={buttonClassName} style={buttonStyle}>
        CONNECT
      </button>
    </div>
  );
}

// `useConnectWallet` requires `PrivyProvider` to be an ancestor at the
// moment it runs. With the MiniPay-first WalletProvider, that's only
// true once the lazy Privy subtree has mounted — which it doesn't on
// SSR, on first paint, or for MiniPay users at all. `PrivyReadyContext`
// is provided by `PrivyTree`; everywhere else `useContext` returns its
// default of `false`, so we render a static placeholder and never call
// the Privy hook outside its provider.
export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const privyReady = useContext(PrivyReadyContext);

  // SSR + first client render must match: always placeholder.
  if (!mounted) return <ConnectButtonPlaceholder />;

  // MiniPay surfaces an injected wallet straight away; there's no
  // manual connect step to expose.
  if ((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay) {
    return null;
  }

  // Privy chunk hasn't loaded yet — keep the placeholder visible so
  // the layout doesn't shift, but don't call any Privy hook.
  if (!privyReady) return <ConnectButtonPlaceholder />;

  return <ConnectButtonInteractive />;
}

function ConnectButtonInteractive() {
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
