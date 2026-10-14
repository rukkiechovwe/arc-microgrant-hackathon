"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chain, isTestnet } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Doodles";
import { HeaderNav } from "./HeaderNav";

export function Header() {
  // The landing page opens on a dark hero, so its header goes dark to match.
  const dark = usePathname() === "/";
  return (
    <header className={dark ? "bg-night text-paper" : "border-b border-line/70 bg-paper/90 backdrop-blur"}>
      <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6 ${dark ? "max-w-7xl" : "max-w-5xl"}`}>
        <Link href="/" className="flex items-center gap-2" aria-label="Your Wish home">
          <Logo tone={dark ? "dark" : "light"} />
          {isTestnet && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold" title={`${chain.name}: test USDC only, no real money`}>
              Testnet
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <HeaderNav tone={dark ? "dark" : "light"} />
          <ConnectButton tone={dark ? "dark" : "light"} />
        </div>
      </div>
    </header>
  );
}
