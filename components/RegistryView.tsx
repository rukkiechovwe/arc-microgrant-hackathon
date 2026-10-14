"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isAddressEqual } from "viem";
import { useConnection } from "wagmi";
import { explorerAddress, GENERAL_FUND, REGISTRY_ADDRESS } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/format";
import { OCCASIONS, SLUG_PATTERN, type RegistryMetadata } from "@/lib/metadata";
import {
  clearPendingMetadata,
  loadPendingMetadata,
  metadataMatchesChain,
  myRegistriesKey,
  publishMetadata,
  syncRegistryOwner,
  useContributionNotes,
  useOnchainRegistry,
  useRegistryMetadata,
  type OnchainRegistryData,
} from "@/lib/useRegistry";
import { friendlyError } from "@/lib/errors";
import { useMounted } from "./ConnectButton";
import { ContributeDialog, type ContributeTarget } from "./ContributeDialog";
import { ContributionsList } from "./ContributionsList";
import { PendingOwnerBanner } from "./OwnerPanel";
import { ProgressBar } from "./ProgressBar";

export function RegistryView() {
  const params = useParams<{ id: string }>();
  // Links are normally slugs ("ada-and-tunde-2274681a67cd"); bare numeric ids still work.
  const key = decodeURIComponent(params.id).toLowerCase();
  const isNumeric = /^\d{1,15}$/.test(key) && key !== "0";
  const isSlug = SLUG_PATTERN.test(key);

  const meta = useRegistryMetadata(key);
  const id: bigint | null = isNumeric ? BigInt(key) : meta.data?.registryId ?? null;
  const onchain = useOnchainRegistry(id);
  const notes = useContributionNotes(id);
  const { address } = useConnection();
  const mounted = useMounted();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ContributeTarget | null>(null);

  // Show the canonical slug link in the address bar when opened by number.
  const slug = meta.data?.slug;
  useEffect(() => {
    if (isNumeric && slug) window.history.replaceState(null, "", `/r/${slug}`);
  }, [isNumeric, slug]);

  if (!REGISTRY_ADDRESS) return <Message title="Not configured" body="The contract address hasn't been set for this deployment." />;
  if (!isNumeric && !isSlug) return <Message title="Registry not found" body="That registry link isn't valid. Check the link you were sent." />;
  if (meta.isPending) return <Loading />;
  if (isSlug && !meta.data) {
    return <Message title="Registry not found" body="We couldn't find a registry at this link. Check the link you were sent." />;
  }
  if (id === null || onchain.isPending) return <Loading />;
  if (onchain.error) {
    const notFound = /RegistryNotFound/.test(onchain.error.message);
    return notFound
      ? <Message title="Registry not found" body="This registry doesn't exist on Arc. Check the link you were sent." />
      : <Message title="Couldn't reach Arc" body="We couldn't load this registry from the blockchain. Please refresh in a moment." />;
  }

  const [registry, targets, raised] = onchain.data as OnchainRegistryData;
  const isOwner = mounted && !!address && isAddressEqual(address, registry.owner);
  const isPendingOwner = mounted && !!address && isAddressEqual(address, registry.pendingOwner);
  const closed = registry.closed;
  const metaVerified = meta.data ? metadataMatchesChain(meta.data.json, registry.metadataHash) : false;
  const metadata = meta.data && metaVerified ? meta.data.metadata : null;

  if (!metadata) {
    return <MissingDetails id={id} isOwner={isOwner} hash={registry.metadataHash} tampered={!!meta.data && !metaVerified} onPublished={() => meta.refetch()} />;
  }

  const funded = targets.filter((t, i) => raised[i] >= t).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-dark uppercase">
          {OCCASIONS[metadata.occasion]}
        </span>
        <h1 className="mt-4 font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">{metadata.title}</h1>
        <p className="mt-2 text-muted">from <strong className="text-ink">{metadata.displayName}</strong></p>
        {metadata.description && <p className="mt-5 leading-relaxed whitespace-pre-line">{metadata.description}</p>}
      </header>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Stat label="Given so far" value={`${formatUsdc(registry.totalRaised, { decimals: 2 })} USDC`} />
        {targets.length > 0 && <Stat label="Gifts fully funded" value={`${funded} of ${targets.length}`} />}
        <ShareButton slug={metadata.slug} />
      </div>

      {closed && (
        <p className="mt-6 rounded-2xl bg-paper p-4 text-sm text-muted ring-1 ring-line">
          This registry is closed. {metadata.displayName} is no longer accepting gifts here. Thank you for your kindness!
        </p>
      )}
      {isPendingOwner && (
        <PendingOwnerBanner registryId={id} onDone={async () => {
          onchain.refetch();
          await syncRegistryOwner(id);
          queryClient.invalidateQueries({ queryKey: myRegistriesKey(address) });
        }} />
      )}
      {isOwner && (
        <div className="mt-8 flex flex-col gap-3 rounded-3xl border border-sage/30 bg-sage-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <strong>This is your registry.</strong> <span className="text-muted">Guests see this page without this note.</span>
          </p>
          <Link href={`/dashboard?r=${metadata.slug}`} className="btn-primary bg-sage hover:bg-sage/90">
            Manage &amp; withdraw
          </Link>
        </div>
      )}

      <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {targets.map((t, i) => (
          <GiftCard key={i} gift={metadata.gifts[i]} target={t} raised={raised[i]} closed={closed}
            onContribute={() => setTarget({ giftId: BigInt(i), name: metadata.gifts[i].name, remaining: t - raised[i] })} />
        ))}
        <div className="card flex flex-col bg-gradient-to-br from-accent-soft/60 to-card p-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-card font-display text-2xl text-accent">$</div>
          <h3 className="mt-4 font-display text-xl font-semibold">General cash gift</h3>
          <p className="mt-1 flex-1 text-sm text-muted">Send any amount for {metadata.displayName} to use however they like.</p>
          <p className="mt-4 text-sm"><strong>{formatUsdc(registry.generalRaised, { decimals: 2 })} USDC</strong> <span className="text-muted">given</span></p>
          <button className="btn-primary mt-4" disabled={closed} onClick={() => setTarget({ giftId: GENERAL_FUND, name: "General cash gift", remaining: null })}>
            {closed ? "Registry closed" : "Send a cash gift"}
          </button>
        </div>
      </section>

      <ContributionsList notes={notes.data} isLoading={notes.isPending} gifts={metadata.gifts} />

      <DataSources owner={registry.owner} />

      {target && (
        <ContributeDialog registryId={id} target={target} metadata={metadata}
          onClose={() => setTarget(null)}
          onConfirmed={() => { onchain.refetch(); notes.refetch(); }} />
      )}
    </div>
  );
}

function GiftCard({ gift, target, raised, closed, onContribute }: {
  gift: RegistryMetadata["gifts"][number]; target: bigint; raised: bigint; closed: boolean; onContribute: () => void;
}) {
  const complete = raised >= target;
  return (
    <div className="card flex flex-col overflow-hidden">
      {gift.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gift.imageUrl} alt="" className="h-44 w-full bg-paper object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-44 place-items-center bg-gradient-to-br from-paper to-accent-soft/50 font-display text-5xl text-accent/70">
          {gift.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold">{gift.name}</h3>
          {complete && <span className="shrink-0 rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold text-sage">Funded</span>}
        </div>
        {gift.description && <p className="mt-1 text-sm text-muted">{gift.description}</p>}
        <div className="mt-auto pt-5">
          <ProgressBar raised={raised} target={target} />
          <p className="mt-2 text-sm">
            <strong>{formatUsdc(raised, { decimals: 2 })}</strong> <span className="text-muted">of {formatUsdc(target, { decimals: 2 })} USDC</span>
          </p>
          <button className="btn-primary mt-4 w-full" disabled={complete || closed} onClick={onContribute}>
            {complete ? "Fully funded, thank you!" : closed ? "Registry closed" : "Contribute"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-2.5">
      <span className="text-muted">{label}</span> <strong className="ml-1">{value}</strong>
    </div>
  );
}

function ShareButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="btn-secondary rounded-2xl" onClick={async () => {
      const url = `${window.location.origin}/r/${slug}`;
      if (navigator.share) await navigator.share({ url }).catch(() => {});
      else { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); }
    }}>
      {copied ? "Link copied!" : "Share registry"}
    </button>
  );
}

function DataSources({ owner }: { owner: `0x${string}` }) {
  const contractUrl = REGISTRY_ADDRESS ? explorerAddress(REGISTRY_ADDRESS) : null;
  const ownerUrl = explorerAddress(owner);
  return (
    <section className="mt-12 rounded-3xl bg-card/60 p-6 text-sm text-muted ring-1 ring-line">
      <h2 className="font-semibold text-ink">Where this information comes from</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong className="text-ink">Amounts, targets and progress</strong> are read live from the Arc blockchain. They only change when a transaction is confirmed.</li>
        <li><strong className="text-ink">Names, descriptions and images</strong> are stored in this app&apos;s database. Their fingerprint matches the one saved on the blockchain when the registry was created ✓.</li>
        <li>Gifts are sent in <strong className="text-ink">USDC</strong>. Only the registry owner&apos;s wallet can withdraw, at any time.</li>
      </ul>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {contractUrl && <a className="underline hover:text-ink" href={contractUrl} target="_blank" rel="noreferrer">Registry contract on Arc explorer</a>}
        {ownerUrl && <a className="underline hover:text-ink" href={ownerUrl} target="_blank" rel="noreferrer">Owner wallet {shortAddress(owner)}</a>}
      </p>
    </section>
  );
}

function MissingDetails({ id, isOwner, hash, tampered, onPublished }: {
  id: bigint; isOwner: boolean; hash: `0x${string}`; tampered: boolean; onPublished: () => void;
}) {
  const mounted = useMounted();
  const pending = mounted && isOwner ? loadPendingMetadata(hash) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Message
      title={tampered ? "Registry details don't match" : "This registry isn't ready yet"}
      body={tampered
        ? "The stored details don't match the fingerprint recorded on the blockchain, so they're hidden for safety."
        : "It exists on Arc, but its details haven't been published yet."}
    >
      {pending && (
        <div className="mt-5">
          <button className="btn-primary" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await publishMetadata(id, pending); clearPendingMetadata(hash); onPublished(); }
            catch (e) { setError(friendlyError(e)); }
            finally { setBusy(false); }
          }}>
            {busy ? "Publishing…" : "Publish my registry details"}
          </button>
          {error && <p className="mt-2 text-sm text-accent-dark">{error}</p>}
        </div>
      )}
    </Message>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 text-center text-muted sm:px-6">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p className="mt-4 text-sm">Loading registry from Arc…</p>
    </div>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children}
      <Link href="/" className="btn-ghost mt-6">← Back home</Link>
    </div>
  );
}
