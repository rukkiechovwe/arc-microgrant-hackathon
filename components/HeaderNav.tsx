"use client";

import Link from "next/link";
import { useMyRegistries } from "@/lib/useRegistry";
import { useMounted } from "./ConnectButton";

/**
 * Desktop nav. A connected wallet always gets "Dashboard" (it handles the no-registry case);
 * "Create a registry" shows until the wallet has one, after which it lives on the dashboard.
 */
export function HeaderNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const mounted = useMounted();
  const { address, hasRegistry } = useMyRegistries();
  const cls = `btn ${tone === "dark" ? "text-paper/70 hover:text-paper" : "text-muted hover:text-ink"}`;
  const connected = mounted && !!address;
  return (
    <>
      {!(connected && hasRegistry) && <Link href="/create" className={cls}>Create a registry</Link>}
      {connected && <Link href="/dashboard" className={cls}>Dashboard</Link>}
    </>
  );
}
