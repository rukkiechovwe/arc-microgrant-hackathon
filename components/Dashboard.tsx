"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { explorerTx, REGISTRY_ADDRESS } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/format";
import { OCCASIONS } from "@/lib/metadata";
import {
  metadataMatchesChain,
  useContributionNotes,
  useContributionNotesMany,
  useMyRegistries,
  useOnchainRegistries,
  useOnchainRegistry,
  type ContributionNote,
  type OnchainRegistryData,
  type RegistryDetails,
} from "@/lib/useRegistry";
import { ConnectButton, useMounted } from "./ConnectButton";
import { ContributionsList } from "./ContributionsList";
import { GiftTile } from "./GiftTile";
import { BalanceCard, ManageCard, WithdrawButton } from "./OwnerPanel";
import { ProgressBar } from "./ProgressBar";

/**
 * Shared gate for both dashboard views: needs a connected wallet that owns at least one registry.
 * Renders `children` with the owner's registries (newest first) once they're loaded.
 */
function OwnerGate({ children }: { children: (registries: RegistryDetails[]) => React.ReactNode }) {
  const mounted = useMounted();
  const mine = useMyRegistries();

  if (!REGISTRY_ADDRESS) return <Notice title="Not configured" body="The contract address hasn't been set for this deployment." />;
  if (!mounted) return <Loading label="Loading…" />;
  if (!mine.address) {
    return (
      <Notice title="Your dashboard" body="Connect the wallet you created your registry with to see your gifts and withdraw them.">
        <div className="mt-8 flex justify-center"><ConnectButton /></div>
      </Notice>
    );
  }
  if (mine.isPending) return <Loading label="Finding your registries…" />;
  if (mine.error) {
    return (
      <Notice title="Couldn't load your registries" body={mine.error.message}>
        <button className="btn-secondary mt-8" onClick={() => mine.refetch()}>Try again</button>
      </Notice>
    );
  }
  const registries = mine.data ?? [];
  if (registries.length === 0) {
    return (
      <Notice title="No registry yet" body="Create one in a couple of minutes, then share the link with your guests.">
        <Link href="/create" className="btn-primary mt-8 px-7 py-3 text-base">Create a registry</Link>
      </Notice>
    );
  }
  return <>{children(registries)}</>;
}

// ─── Overview: /dashboard ────────────────────────────────────────────────────────────────

export function DashboardOverview() {
  const params = useSearchParams();
  const router = useRouter();
  // Old links pointed at /dashboard?r=<slug>; send them to the registry's own page.
  const legacy = params.get("r");
  useEffect(() => {
    if (legacy) router.replace(`/dashboard/${legacy}`);
  }, [legacy, router]);

  return <OwnerGate>{(registries) => <Overview registries={registries} />}</OwnerGate>;
}

type Row = {
  details: RegistryDetails;
  /** Null until the chain has answered, or when the stored details fail the hash check. */
  onchain: OnchainRegistryData | null;
  verified: boolean;
};

function Overview({ registries }: { registries: RegistryDetails[] }) {
  const ids = registries.map((r) => r.registryId);
  const chain = useOnchainRegistries(ids);
  const notes = useContributionNotesMany(ids);

  const rows: Row[] = registries.map((details, i) => {
    const res = chain.data?.[i];
    const onchain = res?.status === "success" ? (res.result as OnchainRegistryData) : null;
    return { details, onchain, verified: !!onchain && metadataMatchesChain(details.json, onchain[0].metadataHash) };
  });

  const loaded = rows.filter((r) => r.onchain);
  const sum = (f: (d: OnchainRegistryData) => bigint) => loaded.reduce((t, r) => t + f(r.onchain!), 0n);
  const received = sum((d) => d[0].totalRaised);
  const available = sum((d) => d[0].totalRaised - d[0].totalWithdrawn);
  const open = loaded.filter((r) => !r.onchain![0].closed).length;

  // Every note, tagged with its registry, newest first.
  const allNotes = notes
    .flatMap((q, i) => (q.data ?? []).map((n) => ({ note: n, row: rows[i] })))
    .sort((a, b) => b.note.blockNumber - a.note.blockNumber);
  const notesLoading = notes.some((q) => q.isPending);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="heading-hero">Dashboard</h1>
        <Link href="/create" className="btn-primary self-start px-6 py-3 text-base sm:self-auto">+ Create a registry</Link>
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Received in total" value={chain.isPending ? "…" : formatUsdc(received, { decimals: 2 })} unit="USDC" />
        <Stat label="Ready to withdraw" value={chain.isPending ? "…" : formatUsdc(available, { decimals: 2 })} unit="USDC" dark />
        <Stat label="Gifts received" value={notesLoading ? "…" : String(allNotes.length)} hint="Made through Your Wish" />
        <Stat label="Registries" value={String(registries.length)} hint={chain.isPending ? undefined : `${open} open for gifts`} />
      </dl>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <h2 className="heading-section">Your registries</h2>
          {chain.error && <p className="mt-4 text-sm text-danger">Couldn&apos;t reach Arc. Amounts will appear once it responds.</p>}
          <ul className="mt-6 space-y-4">
            {rows.map((r) => (
              <RegistryRow key={r.details.slug} row={r} onWithdrawn={() => chain.refetch()} />
            ))}
          </ul>
        </section>

        <section>
          <h2 className="heading-section">Recent gifts</h2>
          {notesLoading ? (
            <p className="mt-6 text-sm text-muted">Loading…</p>
          ) : allNotes.length === 0 ? (
            <p className="card mt-6 p-8 text-center text-sm text-muted">No gifts yet. Share your registry link to get started.</p>
          ) : (
            <ul className="card mt-6 divide-y divide-line">
              {allNotes.slice(0, 8).map(({ note, row }) => (
                <RecentGift key={`${note.txHash}-${note.giftId}-${note.amount}`} note={note} row={row} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RegistryRow({ row, onWithdrawn }: { row: Row; onWithdrawn: () => void }) {
  const { details, onchain, verified } = row;
  const href = `/dashboard/${details.slug}`;
  const title = verified || !onchain ? details.metadata.title : "Registry details hidden";

  const registry = onchain?.[0];
  const targets = onchain?.[1] ?? [];
  const raised = onchain?.[2] ?? [];
  const funded = targets.filter((t, i) => raised[i] >= t).length;
  const targetTotal = targets.reduce((a, b) => a + b, 0n);
  const giftRaised = raised.reduce((a, b) => a + b, 0n);
  const available = registry ? registry.totalRaised - registry.totalWithdrawn : 0n;

  return (
    <li className="card group relative p-5 transition-shadow hover:shadow-[0_24px_48px_-20px_rgba(48,35,31,0.4)] sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold/30 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
              {OCCASIONS[details.metadata.occasion]}
            </span>
            {registry && <StatusPill closed={registry.closed} />}
          </div>
          {/* The title link covers the whole card; the buttons below sit above it. */}
          <Link href={href} className="mt-2 block truncate text-xl font-bold tracking-tight after:absolute after:inset-0 after:content-['']">
            {title}
          </Link>
          {registry ? (
            <>
              <p className="mt-1 text-sm text-muted">
                <strong className="text-ink">{formatUsdc(registry.totalRaised, { decimals: 2 })} USDC</strong> received
                {targets.length > 0 && <> · {funded} of {targets.length} gifts fully funded</>}
              </p>
              {targetTotal > 0n && <div className="mt-3 max-w-md"><ProgressBar raised={giftRaised} target={targetTotal} /></div>}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Loading from Arc…</p>
          )}
        </div>

        <div className="relative z-10 flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <div className="sm:text-right">
            <p className="text-xs text-muted">Available</p>
            <p className="font-condensed text-2xl tracking-wide">{formatUsdc(available, { decimals: 2 })}</p>
          </div>
          {registry && <WithdrawButton registryId={details.registryId} available={available} onDone={onWithdrawn} />}
        </div>
      </div>
      <div className="relative z-10 mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
        <CopyLink slug={details.slug} closed={!!registry?.closed} />
        <Link href={`/r/${details.slug}`} className="text-muted underline-offset-4 hover:text-ink hover:underline">View as a guest</Link>
        <Link href={href} className="ml-auto font-semibold underline-offset-4 hover:underline">Manage →</Link>
      </div>
    </li>
  );
}

function RecentGift({ note, row }: { note: ContributionNote; row: Row }) {
  const meta = row.verified ? row.details.metadata : null;
  const giftName = note.giftId === "general" ? "Cash gift" : meta?.gifts[Number(note.giftId)]?.name ?? `Gift ${note.giftId}`;
  const url = explorerTx(note.txHash);
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{note.name || shortAddress(note.contributor)}</p>
          <p className="truncate text-xs text-muted">
            {giftName} · <Link href={`/dashboard/${row.details.slug}`} className="hover:text-ink hover:underline">{meta?.title ?? "Registry"}</Link>
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold">{formatUsdc(BigInt(note.amount), { decimals: 2 })} <span className="text-xs font-normal text-muted">USDC</span></p>
      </div>
      {note.message && <p className="mt-2 line-clamp-2 text-sm text-ink/75">&ldquo;{note.message}&rdquo;</p>}
      {url && <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-muted underline">View on Arc</a>}
    </li>
  );
}

// ─── Detail: /dashboard/[slug] ───────────────────────────────────────────────────────────

/** Route entry: reads the slug from the URL. Render inside <Suspense> (see the page file). */
export function RegistryDetailRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <RegistryDetail slug={decodeURIComponent(slug).toLowerCase()} />;
}

export function RegistryDetail({ slug }: { slug: string }) {
  return (
    <OwnerGate>
      {(registries) => {
        const details = registries.find((r) => r.slug === slug);
        if (!details) {
          return (
            <Notice title="Not one of yours" body="This registry isn't owned by the connected wallet. Switch wallets, or pick one of your registries.">
              <Link href="/dashboard" className="btn-secondary mt-8">← All registries</Link>
            </Notice>
          );
        }
        return <Detail details={details} />;
      }}
    </OwnerGate>
  );
}

function Detail({ details }: { details: RegistryDetails }) {
  const id = details.registryId;
  const onchain = useOnchainRegistry(id);
  const notes = useContributionNotes(id);

  if (onchain.isPending) return <Loading label="Loading your registry from Arc…" />;
  if (onchain.error) {
    return <Notice title="Couldn't reach Arc" body="We couldn't load your registry from the blockchain. Please refresh in a moment." />;
  }

  const [registry, targets, raised] = onchain.data as OnchainRegistryData;
  if (!metadataMatchesChain(details.json, registry.metadataHash)) {
    return <Notice title="Details don't match" body="The stored details don't match the fingerprint recorded on the blockchain, so they're hidden for safety." />;
  }
  const metadata = details.metadata;
  const funded = targets.filter((t, i) => raised[i] >= t).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← All registries</Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold/30 px-3 py-1 text-xs font-semibold tracking-wide uppercase">{OCCASIONS[metadata.occasion]}</span>
          <StatusPill closed={registry.closed} />
        </div>
        <h1 className="heading-hero mt-4">{metadata.title}</h1>
        <p className="mt-3 text-muted">from <strong className="text-ink">{metadata.displayName}</strong></p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <BalanceCard registryId={id} registry={registry} slug={metadata.slug} onDone={() => onchain.refetch()} />

          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Gifts fully funded" value={targets.length ? `${funded}/${targets.length}` : "—"} />
            <Stat label="Gifts received" value={notes.data ? String(notes.data.length) : "…"} hint="Made through Your Wish" />
          </dl>

          <section className="mt-14">
            <h2 className="heading-section">Your gifts</h2>
            {targets.length === 0 ? (
              <p className="card mt-6 p-8 text-center text-sm text-muted">
                This registry only has the general cash gift. Guests can send any amount.
              </p>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {targets.map((t, i) => (
                  <GiftTile key={i} gift={metadata.gifts[i] ?? { name: `Gift ${i + 1}`, description: "", imageUrl: "" }} target={t} raised={raised[i]} />
                ))}
              </div>
            )}
          </section>

          <ContributionsList
            notes={notes.data}
            isLoading={notes.isPending}
            gifts={metadata.gifts}
            title="Recent gifts"
            emptyText="No gifts yet. Share your link with friends and family to get started."
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card p-6">
            <ShareLink slug={metadata.slug} closed={registry.closed} />
          </div>
          <ManageCard registryId={id} registry={registry} slug={metadata.slug} onDone={() => onchain.refetch()} />
        </aside>
      </div>
    </div>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────────────────

function StatusPill({ closed }: { closed: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${closed ? "bg-line text-muted" : "bg-night text-paper"}`}>
      {closed ? "Closed" : "Open"}
    </span>
  );
}

/** Landing-style stat: big Anton figure with a small caption. `dark` highlights the key number. */
function Stat({ label, value, unit, hint, dark }: { label: string; value: string; unit?: string; hint?: string; dark?: boolean }) {
  return (
    <div className={`rounded-[1.75rem] p-5 sm:p-6 ${dark ? "bg-night text-paper" : "card"}`}>
      <dt className={`text-xs font-semibold tracking-[0.12em] uppercase ${dark ? "text-gold" : "text-muted"}`}>{label}</dt>
      <dd className="mt-3 flex items-baseline gap-1.5">
        <span className="font-condensed text-4xl tracking-wide sm:text-5xl">{value}</span>
        {unit && <span className={`text-xs font-semibold ${dark ? "text-paper/60" : "text-muted"}`}>{unit}</span>}
      </dd>
      {hint && <dd className={`mt-1 text-xs ${dark ? "text-paper/60" : "text-muted"}`}>{hint}</dd>}
    </div>
  );
}

/** A closed registry isn't taking gifts, so its link can't be copied until it's reopened. */
function CopyLink({ slug, closed }: { slug: string; closed: boolean }) {
  const [copied, setCopied] = useState(false);
  if (closed) return <span className="text-muted/70" title="Reopen the registry to share it again">Closed: reopen to share</span>;
  return (
    <button
      className="text-muted underline-offset-4 hover:text-ink hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/r/${slug}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Link copied!" : "Copy link"}
    </button>
  );
}

function ShareLink({ slug, closed }: { slug: string; closed: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${slug}`;
  return (
    <div className="w-full">
      <p className="label">Your registry link</p>
      <div className="flex gap-2">
        <input readOnly disabled={closed} className="input min-w-0 text-sm disabled:opacity-50" value={url} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary shrink-0 px-4" disabled={closed} onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {closed && (
        <p className="mt-2 text-xs text-muted">This registry is closed, so its link can&apos;t be shared. Reopen it under Manage to share again.</p>
      )}
      <Link href={`/r/${slug}`} className="mt-2 inline-block text-xs text-muted underline hover:text-ink">
        See it as your guests do →
      </Link>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-28 text-center text-muted sm:px-6">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold-dark" />
      <p className="mt-4 text-sm">{label}</p>
    </div>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-28 text-center">
      <h1 className="heading-page">{title}</h1>
      <p className="mt-4 text-muted">{body}</p>
      {children}
    </div>
  );
}
