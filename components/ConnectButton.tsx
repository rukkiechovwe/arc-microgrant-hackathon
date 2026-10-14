"use client";

import { useState, useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";

const subscribe = () => () => {};
/** True only after hydration, so wallet state never causes a server/client mismatch. */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * `tone="dark"` is for dark backgrounds (the landing hero and its header), and `outline` makes
 * it a secondary button there. `label` overrides the call to action.
 */
export function ConnectButton({ className = "", tone = "light", outline = false, label = "Connect wallet", buttonClassName = "" }: {
  className?: string; tone?: "light" | "dark"; outline?: boolean; label?: string; buttonClassName?: string;
}) {
  const mounted = useMounted();
  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const dark = tone === "dark";
  const action = `${dark
    ? outline ? "btn border border-white/30 text-paper hover:bg-white/10" : "btn bg-paper text-ink hover:bg-white"
    : outline ? "btn-secondary" : "btn-primary"} ${buttonClassName}`;
  const errorText = `mt-1 max-w-64 text-right text-xs ${dark ? "text-accent-soft" : "text-danger"}`;

  if (!mounted) return <div className={`h-10 w-36 ${className}`} />;

  if (!isConnected || !address) {
    const hasWallet = typeof window !== "undefined" && "ethereum" in window;
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <button
          className={action}
          disabled={connect.isPending}
          onClick={async () => {
            setError(null);
            if (!hasWallet) {
              setError("No wallet found. Install MetaMask (or Rabby), or open this page in your wallet app's browser.");
              return;
            }
            try {
              await connect.mutateAsync({ connector: connectors[0], chainId: chain.id });
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        >
          {connect.isPending ? "Connecting…" : label}
        </button>
        {error && <p className={errorText}>{error}</p>}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <button
          className={action}
          disabled={switchChain.isPending}
          onClick={async () => {
            setError(null);
            try {
              await switchChain.mutateAsync({ chainId: chain.id });
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        >
          {switchChain.isPending ? "Switching…" : `Switch to ${chain.name}`}
        </button>
        {error && <p className={errorText}>{error}</p>}
      </div>
    );
  }

  return (
    <button
      className={`${dark ? "btn border border-white/20 bg-white/5 text-paper hover:bg-white/10" : "btn-secondary"} ${className}`}
      title="Disconnect"
      onClick={() => disconnect.mutate({})}
    >
      <span className="h-2 w-2 rounded-full bg-sage" />
      {shortAddress(address)}
    </button>
  );
}
