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

export function ConnectButton({ className = "" }: { className?: string }) {
  const mounted = useMounted();
  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  if (!mounted) return <div className={`h-10 w-36 ${className}`} />;

  if (!isConnected || !address) {
    const hasWallet = typeof window !== "undefined" && "ethereum" in window;
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <button
          className="btn-primary"
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
          {connect.isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <p className="mt-1 max-w-64 text-right text-xs text-accent-dark">{error}</p>}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <button
          className="btn-primary"
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
        {error && <p className="mt-1 max-w-64 text-right text-xs text-accent-dark">{error}</p>}
      </div>
    );
  }

  return (
    <button
      className={`btn-secondary ${className}`}
      title="Disconnect"
      onClick={() => disconnect.mutate({})}
    >
      <span className="h-2 w-2 rounded-full bg-sage" />
      {shortAddress(address)}
    </button>
  );
}
