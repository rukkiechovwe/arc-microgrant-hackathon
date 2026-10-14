import Link from "next/link";
import { explorerAddress, REGISTRY_ADDRESS } from "@/lib/config";
import { OpenRegistryForm } from "./OpenRegistryForm";
import { Reveal } from "./Reveal";

const facts = [
  { value: "0%", label: "Platform fee" },
  { value: "<$0.01", label: "Network fee per gift" },
  { value: "1 USDC", label: "≈ US$1, always" },
];

export function SiteFooter() {
  const contractUrl = REGISTRY_ADDRESS ? explorerAddress(REGISTRY_ADDRESS) : null;
  const columns = [
    { title: "Make a wish", links: [{ href: "/create", label: "Create a registry" }, { href: "/dashboard", label: "Your dashboard" }] },
    { title: "Explore", links: [{ href: "/#occasions", label: "Occasions" }, { href: "/#how-it-works", label: "How it works" }] },
    {
      title: "Built on",
      links: [
        { href: "https://docs.arc.io", label: "Arc network" },
        { href: "https://www.circle.com/usdc", label: "USDC" },
        ...(contractUrl ? [{ href: contractUrl, label: "Our contract" }] : []),
      ],
    },
  ];

  return (
    <footer className="bg-paper px-3 pt-4 pb-3 sm:px-4 sm:pb-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-night text-paper">
        <Reveal className="reveal-stack px-6 pt-12 sm:px-12 sm:pt-16">
          <dl className="flex flex-wrap gap-x-12 gap-y-4">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline gap-2">
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-condensed text-5xl tracking-wide sm:text-6xl">{f.value}</dd>
                <dd aria-hidden="true" className="text-xs font-semibold tracking-[0.12em] uppercase">{f.label}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_minmax(0,28rem)]">
            <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
              {columns.map((c) => (
                <div key={c.title}>
                  <p className="font-semibold">{c.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {c.links.map((l) => (
                      <li key={l.label}>
                        {l.href.startsWith("http") ? (
                          <a href={l.href} target="_blank" rel="noreferrer" className="text-paper/75 hover:text-paper">{l.label}</a>
                        ) : (
                          <Link href={l.href} className="text-paper/75 hover:text-paper">{l.label}</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <OpenRegistryForm />
          </div>

          <p className="mt-14 text-xs text-paper/60">
            Gifts are sent in USDC on the Arc network and held by the registry contract until the owner withdraws them.
            Amounts are read live from the blockchain.
          </p>
        </Reveal>

        {/* Gold outline that keeps filling with gold from the bottom up (see liquid-fill in globals.css). */}
        <p
          aria-hidden="true"
          className="relative mt-10 -mb-[3vw] text-center font-condensed text-[21vw] leading-none tracking-wide whitespace-nowrap uppercase select-none"
        >
          <span className="text-outline-gold">Your wish</span>
          <span className="animate-liquid-fill absolute inset-0 text-gold">Your wish</span>
        </p>
      </div>
    </footer>
  );
}
