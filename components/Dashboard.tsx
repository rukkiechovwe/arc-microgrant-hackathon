"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { REGISTRY_ADDRESS } from "@/lib/config";
import { formatUsdc, percent } from "@/lib/format";
import { OCCASIONS, type RegistryMetadata } from "@/lib/metadata";
import {
  metadataMatchesChain,
  useContributionNotes,
  useMyRegistries,
  useOnchainRegistry,
  type OnchainRegistryData,
  type RegistryDetails,
} from "@/lib/useRegistry";
import { ConnectButton, useMounted } from "./ConnectButton";
import { ContributionsList } from "./ContributionsList";
import { OwnerPanel } from "./OwnerPanel";
import { ProgressBar } from "./ProgressBar";

export function Dashboard() {
  const mounted = useMounted();
  const mine = useMyRegistries();
  const params = useSearchParams();
  const router = useRouter();

  if (!REGISTRY_ADDRESS) return <Notice title="Not configured" body="The contract address hasn't been set for this deployment." />;
  if (!mounted) return <Loading label="Loading…" />;
  if (!mine.address) {
    return (
      <Notice title="Your dashboard" body="Connect the wallet you created your registry with to see how it's going and withdraw gifts.">
        <div className="mt-6 flex justify-center"><ConnectButton /></div>
      </Notice>
    );
  }
  if (mine.isPending) return <Loading label="Finding your registries…" />;
  if (mine.error) {
    return (
      <Notice title="Couldn't load your registries" body={mine.error.message}>
        <button className="btn-secondary mt-6" onClick={() => mine.refetch()}>Try again</button>
      </Notice>
    );
  }
  const registries = mine.data ?? [];
  if (registries.length === 0) {
    return (
      <Notice title="You don't have a registry yet" body="Create one in a couple of minutes, then share the link with your guests.">
        <Link href="/create" className="btn-primary mt-6">Create a registry</Link>
      </Notice>
    );
  }

  // `?r=<slug>` picks a registry when the wallet owns more than one; default to the newest.
  const selected = registries.find((r) => r.slug === params.get("r")) ?? registries[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Dashboard</p>
        <div className="flex flex-wrap items-center gap-2">
          {registries.length > 1 && (
            <select
              aria-label="Choose a registry"
              className="input w-auto max-w-64 py-1.5 text-sm"
              value={selected.slug}
              onChange={(e) => router.replace(`/dashboard?r=${e.target.value}`)}
            >
              {registries.map((r) => <option key={r.slug} value={r.slug}>{r.metadata.title}</option>)}
            </select>
          )}
          <Link href="/create" className="btn-secondary px-4 py-1.5">+ New registry</Link>
        </div>
      </div>
      <RegistryDashboard key={selected.slug} details={selected} />
    </div>
  );
}

function RegistryDashboard({ details }: { details: RegistryDetails }) {
  const id = details.registryId;
  const onchain = useOnchainRegistry(id);
  const notes = useContributionNotes(id);

  if (onchain.isPending) return <Loading label="Loading your registry from Arc…" />;
  if (onchain.error) {
    return <Notice title="Couldn't reach Arc" body="We couldn't load your registry from the blockchain. Please refresh in a moment." />;
  }

  const [registry, targets, raised] = onchain.data as OnchainRegistryData;
  if (!metadataMatchesChain(details.json, registry.metadataHash)) {
    return <Notice title="Registry details don't match" body="The stored details don't match the fingerprint recorded on the blockchain, so they're hidden for safety." />;
  }
  const metadata = details.metadata;
  const funded = targets.filter((t, i) => raised[i] >= t).length;

  return (
    <>
      <header className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-dark uppercase">
              {OCCASIONS[metadata.occasion]}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registry.closed ? "bg-line text-muted" : "bg-sage-soft text-sage"}`}>
              {registry.closed ? "Closed to new gifts" : "Open for gifts"}
            </span>
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{metadata.title}</h1>
          <p className="mt-1 text-muted">from <strong className="text-ink">{metadata.displayName}</strong></p>
        </div>
        <ShareLink slug={metadata.slug} />
      </header>

      <OwnerPanel registryId={id} registry={registry} onDone={() => onchain.refetch()} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Gifts fully funded" value={targets.length ? `${funded} of ${targets.length}` : "No gifts listed"} />
        <Tile label="Cash gifts" value={`${formatUsdc(registry.generalRaised, { decimals: 2 })} USDC`} />
        <Tile label="Contributions" value={notes.data ? String(notes.data.length) : "…"} hint="Made through this app" />
      </div>

      <GiftProgress gifts={metadata.gifts} targets={targets} raised={raised} />

      <ContributionsList
        notes={notes.data}
        isLoading={notes.isPending}
        gifts={metadata.gifts}
        title="Recent gifts"
        emptyText="No gifts yet. Share your link with friends and family to get started."
      />
    </>
  );
}

function GiftProgress({ gifts, targets, raised }: {
  gifts: RegistryMetadata["gifts"]; targets: readonly bigint[]; raised: readonly bigint[];
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl font-semibold">Your gifts</h2>
      {targets.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          This registry only has the general cash gift. Guests can send any amount.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-3xl border border-line bg-card">
          {targets.map((t, i) => {
            const done = raised[i] >= t;
            return (
              <li key={i} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 sm:w-56">
                  <p className="truncate font-medium">{gifts[i]?.name ?? `Gift ${i + 1}`}</p>
                  <p className="text-xs text-muted">{done ? "Fully funded" : `${formatUsdc(t - raised[i], { decimals: 2 })} USDC to go`}</p>
                </div>
                <div className="flex-1"><ProgressBar raised={raised[i]} target={t} /></div>
                <p className="text-sm sm:w-48 sm:text-right">
                  <strong>{formatUsdc(raised[i], { decimals: 2 })}</strong>{" "}
                  <span className="text-muted">of {formatUsdc(t, { decimals: 2 })} · {Math.floor(percent(raised[i], t))}%</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${slug}`;
  return (
    <div className="w-full md:max-w-sm">
      <p className="label">Your registry link</p>
      <div className="flex gap-2">
        <input readOnly className="input min-w-0 text-sm" value={url} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary shrink-0 px-4" onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <Link href={`/r/${slug}`} className="mt-2 inline-block text-xs text-muted underline hover:text-ink">
        See it as your guests do →
      </Link>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 text-center text-muted sm:px-6">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p className="mt-4 text-sm">{label}</p>
    </div>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children}
    </div>
  );
}
