"use client";

import { createContext } from "react";

/**
 * Whether the lazy Privy subtree has mounted above this point in the tree.
 *
 * This lives in its own module, importing nothing but React, and that
 * isolation is the whole point. It used to be exported from
 * `wallet-provider-privy.tsx`, which meant `connect-button.tsx` — mounted by
 * `TopBar` on every page, including the map — reached `@privy-io/react-auth`
 * through a static import just to read a boolean. Webpack resolves static
 * imports at build time, so that pulled Privy, `x402` and `@solana/kit` into
 * the shared chunk for MiniPay users, who never mount the Privy tree and can
 * never use any of it.
 *
 * The default is `false`, which is what SSR, the first client render, and
 * every MiniPay client see. `PrivyTree` provides `true`.
 *
 * Keep this module free of `@privy-io/*` imports. A named import is enough to
 * pull in a module's entire graph, and the cost lands on the lowest-end
 * devices we serve.
 */
export const PrivyReadyContext = createContext(false);
