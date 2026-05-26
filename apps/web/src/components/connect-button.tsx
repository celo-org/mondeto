"use client";

import { useConnectWallet } from "@privy-io/react-auth";
import { useAccount, useDisconnect } from "wagmi";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generateUsername } from "@/lib/username";
import { useProfile } from "@/hooks/useProfile";
import { useMaps } from "@/hooks/useMaps";

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

// `useConnectWallet` is a Privy hook that reads the PrivyProvider context.
// During Next's SSR pass the context is uninitialized, so the hook warns
// `useWallets was called outside the PrivyProvider component` and then
// crashes on a null ref — every route 500s. Splitting the interactive
// body into a child that only mounts after hydration keeps the hook off
// the server path while preserving an SSR-rendered placeholder.
export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div style={{ position: "relative" }}>
        <button className={buttonClassName} style={buttonStyle}>
          CONNECT
        </button>
      </div>
    );
  }

  return <ConnectButtonInteractive />;
}

function ConnectButtonInteractive() {
  const { connectWallet } = useConnectWallet();
  const { disconnect } = useDisconnect();
  const { isConnected, address } = useAccount();
  const { currentMapId } = useMaps();
  const { name: onChainName } = useProfile(address, currentMapId);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum?.isMiniPay) {
      setIsMiniPay(true);
    }
  }, []);

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

  if (isMiniPay) return null;

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
