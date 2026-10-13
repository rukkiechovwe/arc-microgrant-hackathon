import Link from "next/link";
import { chain, isTestnet } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";

export function Header() {
  return (
    <header className="border-b border-line/70 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent font-display text-lg text-white">g</span>
          <span className="font-display text-lg font-semibold tracking-tight">Gift Registry</span>
          {isTestnet && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold" title={`${chain.name}: test USDC only, no real money`}>
              Testnet
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/create" className="btn-ghost hidden sm:inline-flex">
            Create a registry
          </Link>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
