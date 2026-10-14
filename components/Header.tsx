"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { chain, isTestnet } from "@/lib/config";
import { useMyRegistries } from "@/lib/useRegistry";
import { ConnectButton, useMounted } from "./ConnectButton";
import { Logo } from "./Doodles";
import { HeaderNav } from "./HeaderNav";

/**
 * `tone` is set by the route group layout ("dark" over the landing hero) rather than read from
 * the URL: with cacheComponents, usePathname() in a layout blocks prerendering of dynamic routes.
 */
export function Header({ tone }: { tone: "light" | "dark" }) {
  const dark = tone === "dark";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`relative z-40 ${dark || open ? "bg-night text-paper" : "border-b border-line/70 bg-paper/90 backdrop-blur"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Your Wish home">
          <Logo tone={dark || open ? "dark" : "light"} />
          {isTestnet && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold" title={`${chain.name}: test USDC only, no real money`}>
              Testnet
            </span>
          )}
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <HeaderNav tone={tone} />
          <ConnectButton tone={tone} />
        </div>

        <button
          className={`grid h-10 w-10 place-items-center rounded-full sm:hidden ${dark || open ? "bg-white/10" : "bg-white ring-1 ring-line"}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </div>

      {open && <MobileMenu onClose={() => setOpen(false)} />}
    </header>
  );
}

/** Full-height sheet under the header on small screens. */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const mounted = useMounted();
  const { address } = useMyRegistries();
  const links = [
    { href: "/", label: "Home" },
    { href: "/create", label: "Create a registry" },
    ...(mounted && address ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/#occasions", label: "Occasions" },
    { href: "/#how-it-works", label: "How it works" },
  ];

  return (
    <>
      {/* Tapping the dimmed area below the sheet closes it. */}
      <div className="fixed inset-0 top-[68px] bg-night/40" onClick={onClose} aria-hidden="true" />
      <nav id="mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full border-t border-white/10 bg-night px-4 pt-4 pb-8 text-paper sm:hidden">
        <ul>
          {links.map((l) => (
            <li key={l.href} className="border-b border-white/10">
              <Link href={l.href} onClick={onClose} className="flex items-center justify-between py-4 font-condensed text-3xl tracking-wide uppercase">
                {l.label}
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 [&_button]:w-full [&>div]:items-stretch">
          <ConnectButton tone="dark" buttonClassName="py-3 text-base" />
        </div>
      </nav>
    </>
  );
}
