"use client";

import Link from "next/link";
import { useMyRegistries } from "@/lib/useRegistry";
import { useMounted } from "./ConnectButton";

/** "Dashboard" once the connected wallet owns a registry, otherwise "Create a registry". */
export function HeaderNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const mounted = useMounted();
  const { hasRegistry } = useMyRegistries();
  const cls = `btn ${tone === "dark" ? "text-paper/70 hover:text-paper" : "text-muted hover:text-ink"}`;
  return mounted && hasRegistry ? (
    <Link href="/dashboard" className={cls}>Dashboard</Link>
  ) : (
    <Link href="/create" className={`${cls} hidden sm:inline-flex`}>Create a registry</Link>
  );
}
