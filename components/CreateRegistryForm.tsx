"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { useConfig, useConnection } from "wagmi";
import { chain, explorerTx, MAX_GIFTS, MIN_AMOUNT, REGISTRY_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatNgn, formatUsdc, ngnToUsdcUnits, parseUsdcInput } from "@/lib/format";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import { hashMetadata, makeSlug, OCCASIONS, serializeMetadata, type Occasion, type RegistryMetadata } from "@/lib/metadata";
import { sendContractTx } from "@/lib/tx";
import { clearPendingMetadata, publishMetadata, savePendingMetadata } from "@/lib/useRegistry";
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
  const { isConnected, chainId, address } = useConnection();

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occasion, setOccasion] = useState<Occasion>("wedding");
  const [currency, setCurrency] = useState<"usdc" | "ngn">("usdc");
  const [rate, setRate] = useState("");
  const [gifts, setGifts] = useState<GiftDraft[]>([emptyGift()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submitting = useRef(false);

  const rateNum = Number(rate.replace(/,/g, ""));
  const rateValid = rate.trim() !== "" && Number.isFinite(rateNum) && rateNum > 0;
  const busy = status.kind === "wallet" || status.kind === "pending" || status.kind === "saving";

  function giftTarget(g: GiftDraft): { units: bigint | null; ngn: number | null } {
    if (currency === "usdc") return { units: parseUsdcInput(g.amount), ngn: null };
    const ngn = Number(g.amount.replace(/,/g, ""));
    if (!rateValid || !Number.isFinite(ngn) || ngn <= 0) return { units: null, ngn: null };
    return { units: ngnToUsdcUnits(ngn, rateNum), ngn };
  }

  function build(): { metadata: RegistryMetadata; targets: bigint[] } | string {
    if (!address) return "Connect your wallet first.";
    if (!displayName.trim()) return "Please enter your name.";
    if (!title.trim()) return "Please give your registry a title.";
    if (currency === "ngn" && !rateValid) return "Enter the exchange rate you want to use (₦ per 1 USDC).";
    const filled = gifts.filter((g) => g.name.trim() || g.amount.trim() || g.description.trim() || g.imageUrl.trim());
    const targets: bigint[] = [];
    const giftMeta: RegistryMetadata["gifts"] = [];
    for (const [i, g] of filled.entries()) {
      if (!g.name.trim()) return `Gift ${i + 1} needs a name.`;
      const { units, ngn } = giftTarget(g);
      if (units === null || units < MIN_AMOUNT) return `"${g.name}" needs a target of at least 0.01 USDC.`;
      const img = g.imageUrl.trim();
      if (img && !/^https?:\/\/\S+$/.test(img)) return `The image link for "${g.name}" must start with https://`;
      targets.push(units);
      giftMeta.push({ name: g.name.trim(), description: g.description.trim(), imageUrl: img, targetNgn: ngn });
    }
    return {
      targets,
      metadata: {
        v: 2,
        owner: address.toLowerCase(),
        slug: makeSlug(title),
        displayName: displayName.trim(),
        title: title.trim(),
        description: description.trim(),
        occasion,
        ngnPerUsdc: rateValid ? rateNum : null,
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Gifts</h2>
          <div className="flex rounded-full border border-line p-1 text-sm">
            {(["usdc", "ngn"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)}
                className={`rounded-full px-3 py-1 ${currency === c ? "bg-ink text-white" : "text-muted"}`}>
                Price in {c === "usdc" ? "USDC" : "Naira"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-paper p-4 text-sm text-muted">
          <label className="label" htmlFor="rate">
            Exchange rate: ₦ per 1 USDC{" "}
            <span className="font-normal text-muted">{currency === "ngn" ? "(required)" : "(optional, to show naira equivalents)"}</span>
          </label>
          <input id="rate" className="input max-w-48" inputMode="decimal" placeholder="e.g. 1500" value={rate} onChange={(e) => setRate(e.target.value)} />
          <p className="mt-2 text-xs">
            Guests always pay in USDC. Targets are stored onchain in USDC. Naira figures are only shown as a guide, at
            the rate you enter here, and nothing is converted to naira automatically.
          </p>
        </div>

        {gifts.map((g, i) => {
          const t = giftTarget(g);
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
                <div>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">{currency === "usdc" ? "$" : "₦"}</span>
                    <input className="input pl-7" inputMode="decimal" placeholder={currency === "usdc" ? "Target USDC" : "Target naira"} value={g.amount} onChange={(e) => updateGift(g.key, { amount: e.target.value })} />
                  </div>
                  {t.units !== null && (
                    <p className="mt-1 text-xs text-muted">
                      {currency === "ngn"
                        ? `= ${formatUsdc(t.units, { decimals: 2 })} USDC`
                        : rateValid ? `≈ ${formatNgn(Number(t.units) / 1e6 * rateNum)}` : null}
                    </p>
                  )}
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
        <Link href={`/r/${slug}`} className="btn-primary">View registry</Link>
        <TxLink hash={hash} />
      </div>
    </div>
  );
}
