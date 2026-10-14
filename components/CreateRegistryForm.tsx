"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { useConfig, useConnection } from "wagmi";
import { chain, explorerTx, MAX_GIFTS, MIN_AMOUNT, REGISTRY_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { parseUsdcInput } from "@/lib/format";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import { hashMetadata, makeSlug, OCCASIONS, serializeMetadata, type Occasion, type RegistryMetadata } from "@/lib/metadata";
import { sendContractTx } from "@/lib/tx";
import { clearPendingMetadata, myRegistriesKey, publishMetadata, savePendingMetadata } from "@/lib/useRegistry";
import { ConnectButton, useMounted } from "./ConnectButton";

type GiftDraft = { key: number; name: string; description: string; imageUrl: string; amount: string };
type Status =
  | { kind: "idle" }
  | { kind: "wallet" }
  | { kind: "pending"; hash: Hash }
  | { kind: "saving"; hash: Hash; id: bigint; json: string }
  | { kind: "saveFailed"; hash: Hash; id: bigint; json: string; error: string }
  | { kind: "done"; hash: Hash; id: bigint; slug: string };

let nextKey = 1;
const emptyGift = (): GiftDraft => ({ key: nextKey++, name: "", description: "", imageUrl: "", amount: "" });

export function CreateRegistryForm() {
  const mounted = useMounted();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { isConnected, chainId, address } = useConnection();

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occasion, setOccasion] = useState<Occasion>("wedding");
  const [gifts, setGifts] = useState<GiftDraft[]>([emptyGift()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submitting = useRef(false);

  const busy = status.kind === "wallet" || status.kind === "pending" || status.kind === "saving";

  function build(): { metadata: RegistryMetadata; targets: bigint[] } | string {
    if (!address) return "Connect your wallet first.";
    if (!displayName.trim()) return "Please enter your name.";
    if (!title.trim()) return "Please give your registry a title.";
    const filled = gifts.filter((g) => g.name.trim() || g.amount.trim() || g.description.trim() || g.imageUrl.trim());
    const targets: bigint[] = [];
    const giftMeta: RegistryMetadata["gifts"] = [];
    for (const [i, g] of filled.entries()) {
      if (!g.name.trim()) return `Gift ${i + 1} needs a name.`;
      const units = parseUsdcInput(g.amount);
      if (units === null || units < MIN_AMOUNT) return `"${g.name}" needs a target of at least 0.01 USDC.`;
      const img = g.imageUrl.trim();
      if (img && !/^https?:\/\/\S+$/.test(img)) return `The image link for "${g.name}" must start with https://`;
      targets.push(units);
      giftMeta.push({ name: g.name.trim(), description: g.description.trim(), imageUrl: img });
    }
    return {
      targets,
      metadata: {
        v: 3,
        owner: address.toLowerCase(),
        slug: makeSlug(title),
        displayName: displayName.trim(),
        title: title.trim(),
        description: description.trim(),
        occasion,
        gifts: giftMeta,
        createdAt: new Date().toISOString(),
      },
    };
  }

  async function save(id: bigint, json: string, hash: Hash) {
    setStatus({ kind: "saving", hash, id, json });
    try {
      await publishMetadata(id, json);
      clearPendingMetadata(hashMetadata(json));
      queryClient.invalidateQueries({ queryKey: myRegistriesKey(address) });
      setStatus({ kind: "done", hash, id, slug: JSON.parse(json).slug });
    } catch (e) {
      setStatus({ kind: "saveFailed", hash, id, json, error: friendlyError(e) });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || busy) return;
    setFormError(null);
    const built = build();
    if (typeof built === "string") return setFormError(built);
    if (!REGISTRY_ADDRESS) return setFormError("The app isn't configured with a contract address yet.");

    submitting.current = true;
    const json = serializeMetadata(built.metadata);
    const metadataHash = hashMetadata(json);
    savePendingMetadata(metadataHash, json);
    setStatus({ kind: "wallet" });
    try {
      const receipt = await sendContractTx(
        config,
        { address: REGISTRY_ADDRESS, abi: giftRegistryAbi, functionName: "createRegistry", args: [metadataHash, built.targets] },
        (hash) => setStatus({ kind: "pending", hash }),
      );
      const [created] = parseEventLogs({ abi: giftRegistryAbi, eventName: "RegistryCreated", logs: receipt.logs });
      if (!created) throw new Error("Registry was created but its id could not be read. Check the transaction on the explorer.");
      await save(created.args.registryId, json, receipt.transactionHash);
    } catch (err) {
      setFormError(friendlyError(err));
      setStatus({ kind: "idle" });
    } finally {
      submitting.current = false;
    }
  }

  if (status.kind === "done") return <Created slug={status.slug} hash={status.hash} />;

  const updateGift = (key: number, patch: Partial<GiftDraft>) =>
    setGifts((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <fieldset disabled={busy} className="card space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="displayName">Your name</label>
            <input id="displayName" className="input" maxLength={60} placeholder="Ada & Tunde" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="occasion">Occasion</label>
            <select id="occasion" className="input" value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
              {Object.entries(OCCASIONS).map(([k, v]) => (
                <option key={k} value={k}>{k === "other" ? "Other celebration" : v}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="title">Registry title</label>
          <input id="title" className="input" maxLength={100} placeholder="Ada & Tunde's Wedding" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="description">Message to guests <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="description" className="input min-h-24" maxLength={2000} placeholder="Thank you for celebrating with us…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </fieldset>

      <fieldset disabled={busy} className="card space-y-4 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Gifts</h2>
          <p className="mt-1 text-sm text-muted">Set each target in USDC (1 USDC ≈ US$1). Guests contribute in USDC too.</p>
        </div>

        {gifts.map((g, i) => {
          return (
            <div key={g.key} className="space-y-3 rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">Gift {i + 1}</span>
                <button type="button" className="text-sm text-muted hover:text-accent-dark" onClick={() => setGifts((gs) => gs.filter((x) => x.key !== g.key))}>
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <input className="input" maxLength={80} placeholder="Gift name, e.g. Refrigerator" value={g.name} onChange={(e) => updateGift(g.key, { name: e.target.value })} />
                <div className="relative">
                  <input className="input pr-14" inputMode="decimal" placeholder="Target" value={g.amount} onChange={(e) => updateGift(g.key, { amount: e.target.value })} />
                  <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">USDC</span>
                </div>
              </div>
              <input className="input" maxLength={500} placeholder="Short description (optional)" value={g.description} onChange={(e) => updateGift(g.key, { description: e.target.value })} />
              <input className="input" maxLength={1000} placeholder="Image link, https://… (optional)" value={g.imageUrl} onChange={(e) => updateGift(g.key, { imageUrl: e.target.value })} />
            </div>
          );
        })}

        {gifts.length < MAX_GIFTS && (
          <button type="button" className="btn-secondary w-full" onClick={() => setGifts((gs) => [...gs, emptyGift()])}>
            + Add a gift
          </button>
        )}
        <p className="text-xs text-muted">
          A general cash gift option is always included. Each gift stops accepting contributions once its target is met.
        </p>
      </fieldset>

      {formError && <p className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-dark">{formError}</p>}

      {status.kind === "saveFailed" ? (
        <div className="card space-y-3 p-5 text-sm">
          <p>
            Your registry <strong>#{status.id.toString()}</strong> was created on Arc, but saving its details failed:{" "}
            <span className="text-accent-dark">{status.error}</span>
          </p>
          <button type="button" className="btn-primary" onClick={() => save(status.id, status.json, status.hash)}>
            Try saving again
          </button>
        </div>
      ) : !mounted ? null : !isConnected || chainId !== chain.id ? (
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-muted">Connect the wallet that should receive the gifts. Only this wallet can withdraw.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-3">
          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy}>
            {status.kind === "wallet" && "Confirm in your wallet…"}
            {status.kind === "pending" && "Creating your registry on Arc…"}
            {status.kind === "saving" && "Saving details…"}
            {status.kind === "idle" && "Create registry"}
          </button>
          {status.kind === "pending" && <TxLink hash={status.hash} />}
          <p className="text-center text-xs text-muted">
            Creating a registry is one transaction on Arc. The network fee is a fraction of a cent, paid in USDC.
          </p>
        </div>
      )}
    </form>
  );
}

function TxLink({ hash }: { hash: Hash }) {
  const url = explorerTx(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block text-center text-xs text-accent underline">
      View transaction on the Arc explorer
    </a>
  ) : null;
}

function Created({ slug, hash }: { slug: string; hash: Hash }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/r/${slug}` : `/r/${slug}`;
  return (
    <div className="card mt-8 space-y-5 p-7 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sage-soft text-xl text-sage">✓</div>
      <h2 className="font-display text-2xl font-semibold">Your registry is live</h2>
      <p className="text-sm text-muted">Share this link with your guests:</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly className="input text-center sm:text-left" value={url} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary" onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
        }}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/dashboard?r=${slug}`} className="btn-primary">Go to your dashboard</Link>
          <Link href={`/r/${slug}`} className="btn-secondary">View as a guest</Link>
        </div>
        <TxLink hash={hash} />
      </div>
    </div>
  );
}
