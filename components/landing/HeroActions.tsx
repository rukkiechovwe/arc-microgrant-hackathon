"use client";

import Link from "next/link";
import { useMyRegistries } from "@/lib/useRegistry";
import { ConnectButton, useMounted } from "../ConnectButton";

const big = "px-7 py-3 text-base";

/** Hero CTAs. A connected wallet gets its dashboard; everyone else can create or connect. */
export function HeroActions() {
  const mounted = useMounted();
  const { address, hasRegistry } = useMyRegistries();

  return (
    <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-start">
      {mounted && address ? (
        <>
          <Link href="/dashboard" className={`btn bg-gold text-night hover:bg-stone ${big}`}>Go to your dashboard</Link>
          <Link href="/create" className={`btn border border-white/30 text-paper hover:bg-white/10 ${big}`}>
            {hasRegistry ? "Create another registry" : "Create a registry"}
          </Link>
        </>
      ) : (
        <>
          <Link href="/create" className={`btn bg-gold text-night hover:bg-stone ${big}`}>Create a registry</Link>
          {mounted && !address && <ConnectButton tone="dark" outline label="Connect your wallet" buttonClassName={big} />}
        </>
      )}
    </div>
  );
}
