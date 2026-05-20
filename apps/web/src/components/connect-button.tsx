"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";

function truncateAddr(addr?: string) {
  if (!addr) return "0X…";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`.toUpperCase();
}

export function ConnectButton() {
  const { login, logout, authenticated, ready, user } = usePrivy();
  const { isConnected, address } = useAccount();
  const [isMiniPay, setIsMiniPay] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum && (window.ethereum as any).isMiniPay) {
      setIsMiniPay(true);
    }
  }, []);

  if (isMiniPay) return null;
  if (!ready) return null;

  const onClick = authenticated ? logout : login;
  const walletAddr = (user?.wallet?.address as string | undefined) ?? (address as string | undefined);
  const label =
    !authenticated && !isConnected
      ? "CONNECT"
      : authenticated || isConnected
        ? truncateAddr(walletAddr)
        : "CONNECT";

  return (
    <button
      onClick={onClick}
      className="pixel-btn pixel-btn-sm font-display"
      style={{
        fontSize: 8,
        letterSpacing: 1.5,
        width: 108,
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}
