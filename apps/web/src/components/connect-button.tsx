"use client";

import dynamic from "next/dynamic";
import { useContext, useEffect, useState } from "react";
import { PrivyReadyContext } from "./privy-ready-context";
import { buttonClassName, buttonStyle } from "./connect-button-styles";

function ConnectButtonPlaceholder() {
  return (
    <div style={{ position: "relative" }}>
      <button className={buttonClassName} style={buttonStyle}>
        CONNECT
      </button>
    </div>
  );
}

// The Privy-dependent half is lazy, and this module must stay free of any
// `@privy-io/*` import — direct or transitive — for that to mean anything.
// `TopBar` mounts this on every page, so a static import here lands in the
// shared chunk and ships `@privy-io/react-auth` + `x402` + `@solana/kit` to
// MiniPay clients, which never render the interactive half at all. The
// runtime guard below cannot prevent that on its own: webpack resolves
// imports at build time and has no idea `privyReady` will be `false`.
const ConnectButtonInteractive = dynamic(
  () => import("./connect-button-interactive"),
  { ssr: false, loading: () => <ConnectButtonPlaceholder /> },
);

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
