"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isAddressEqual } from "viem";
import { useConnection } from "wagmi";
import { explorerAddress, GENERAL_FUND, REGISTRY_ADDRESS } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/format";
import { OCCASIONS, SLUG_PATTERN } from "@/lib/metadata";
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
import { GiftTile } from "./GiftTile";

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

  const giveCash = () => setTarget({ giftId: GENERAL_FUND, name: "General cash gift", remaining: null });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <span className="rounded-full bg-gold/30 px-3 py-1 text-xs font-semibold tracking-wide text-ink uppercase">
          {OCCASIONS[metadata.occasion]}
        </span>
        <h1 className="heading-hero mt-4">{metadata.title}</h1>
        <p className="mt-3 text-muted">from <strong className="text-ink">{metadata.displayName}</strong></p>
      </header>

      {closed && (
        <p className="mt-8 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
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

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <h2 className="heading-section">The wishlist</h2>
          {targets.length === 0 ? (
            <p className="card mt-6 p-8 text-center text-sm text-muted">
              {metadata.displayName} hasn&apos;t listed specific gifts. Send a cash gift of any amount instead.
            </p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {targets.map((t, i) => {
                const complete = raised[i] >= t;
                return (
                  <GiftTile key={i} gift={metadata.gifts[i]} target={t} raised={raised[i]}
                    action={
                      <button className="btn-primary w-full" disabled={complete || closed}
                        onClick={() => setTarget({ giftId: BigInt(i), name: metadata.gifts[i].name, remaining: t - raised[i] })}>
                        {complete ? "Fully funded, thank you!" : closed ? "Registry closed" : "Contribute"}
                      </button>
                    } />
                );
              })}
            </div>
          )}

          <ContributionsList notes={notes.data} isLoading={notes.isPending} gifts={metadata.gifts} />
          <DataSources owner={registry.owner} />
        </div>

        {/* Comes right after the title on mobile; right-hand column from lg up. */}
        <aside className="order-first space-y-4 lg:sticky lg:top-6 lg:order-last lg:self-start">
          {isOwner && (
            <div className="rounded-[1.75rem] bg-gold p-5">
              <p className="text-sm"><strong>This is your registry.</strong> Guests see this page without this note.</p>
              <Link href={`/dashboard/${metadata.slug}`} className="btn mt-3 w-full bg-night text-paper hover:bg-night-soft">
                Manage &amp; withdraw
              </Link>
            </div>
          )}

          <section className="card p-6 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-night font-condensed text-3xl text-gold ring-4 ring-gold/40">
              {metadata.displayName.trim().charAt(0).toUpperCase()}
            </div>
            <p className="mt-4 text-lg font-bold tracking-tight">{metadata.displayName}</p>
            <p className="text-sm text-muted">{OCCASIONS[metadata.occasion]}</p>
            {metadata.description && <p className="mt-4 text-left text-sm leading-relaxed whitespace-pre-line text-ink/80">{metadata.description}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5 text-left">
              <div>
                <dt className="text-xs text-muted">Given so far</dt>
                <dd className="font-condensed text-2xl tracking-wide">{formatUsdc(registry.totalRaised, { decimals: 2 })}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Gifts funded</dt>
                <dd className="font-condensed text-2xl tracking-wide">{targets.length ? `${funded}/${targets.length}` : "—"}</dd>
              </div>
            </dl>
            {!closed && <ShareButton slug={metadata.slug} />}
          </section>

          <section className="relative overflow-hidden rounded-[1.75rem] bg-night p-6 text-paper">
            <svg className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 text-gold/25" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              {[40, 60, 80, 100].map((r) => <circle key={r} cx="200" cy="0" r={r * 1.6} stroke="currentColor" strokeWidth="1" />)}
            </svg>
            <p className="relative text-xs font-semibold tracking-[0.14em] text-gold uppercase">General cash gift</p>
            <p className="relative mt-3 text-xl font-bold tracking-tight">Send any amount for {metadata.displayName} to use however they like.</p>
            <p className="relative mt-4 text-sm text-paper/70">
              <strong className="font-condensed text-2xl tracking-wide text-paper">{formatUsdc(registry.generalRaised, { decimals: 2 })}</strong> USDC given
            </p>
            <button className="btn-primary relative mt-5 w-full py-3" disabled={closed} onClick={giveCash}>
              {closed ? "Registry closed" : "Send a cash gift"}
            </button>
          </section>
        </aside>
      </div>

      {target && (
        <ContributeDialog registryId={id} target={target} metadata={metadata}
          onClose={() => setTarget(null)}
          onConfirmed={() => { onchain.refetch(); notes.refetch(); }} />
      )}
    </div>
  );
}


function ShareButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="btn-secondary mt-5 w-full" onClick={async () => {
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
    <section className="card mt-12 p-6 text-sm text-muted sm:p-8">
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
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </Message>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-28 text-center text-muted sm:px-6">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold-dark" />
      <p className="mt-4 text-sm">Loading registry from Arc…</p>
    </div>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="heading-section">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children}
      <Link href="/" className="btn-ghost mt-6">← Back home</Link>
    </div>
  );
}
