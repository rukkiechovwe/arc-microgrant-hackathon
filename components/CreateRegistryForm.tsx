"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { useConfig, useConnection } from "wagmi";
import { chain, explorerTx, MAX_GIFTS, MIN_AMOUNT, REGISTRY_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatUsdc, parseUsdcInput } from "@/lib/format";
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
  const [step, setStep] = useState(0);
  const submitting = useRef(false);

  const busy = status.kind === "wallet" || status.kind === "pending" || status.kind === "saving";

  function checkOccasion(): string | null {
    if (!displayName.trim()) return "Please enter your name.";
    if (!title.trim()) return "Please give your registry a title.";
    return null;
  }

  function checkGifts(): string | null {
    const built = buildGifts();
    return typeof built === "string" ? built : null;
  }

  function buildGifts(): { targets: bigint[]; giftMeta: RegistryMetadata["gifts"] } | string {
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
    return { targets, giftMeta };
  }

  function build(): { metadata: RegistryMetadata; targets: bigint[] } | string {
    if (!address) return "Connect your wallet first.";
    const problem = checkOccasion();
    if (problem) return problem;
    const gifted = buildGifts();
    if (typeof gifted === "string") return gifted;
    const { targets, giftMeta } = gifted;
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

  const updateGift = (key: number, patch: Partial<GiftDraft>) =>
    setGifts((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  /** Moves forward only when the current step is valid; going back is always allowed. */
  function goTo(next: number) {
    if (next > step) {
      const problem = step === 0 ? checkOccasion() : step === 1 ? checkGifts() : null;
      if (problem) return setFormError(problem);
    }
    setFormError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const preview = buildGifts();
  const giftList = typeof preview === "string" ? [] : preview.giftMeta.map((g, i) => ({ ...g, target: preview.targets[i] }));
  const total = giftList.reduce((t, g) => t + g.target, 0n);

  return (
    <>
      <Steps current={step} onPick={(i) => !busy && i < step && goTo(i)} />

      <form
        onSubmit={(e) => {
          if (step < 2) {
            e.preventDefault();
            goTo(step + 1);
          } else onSubmit(e);
        }}
        className="mt-10"
      >
        {step === 0 && (
          <fieldset className="card space-y-6 p-6 sm:p-8">
            <div>
              <p className="label">What are you celebrating?</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(OCCASIONS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOccasion(k as Occasion)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      occasion === k ? "border-night bg-night text-paper" : "border-line bg-white hover:border-gold-dark"
                    }`}
                    aria-pressed={occasion === k}
                  >
                    {k === "other" ? "Something else" : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="displayName">Your name</label>
                <input id="displayName" className="input" maxLength={60} placeholder="Ada & Tunde" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="title">Registry title</label>
                <input id="title" className="input" maxLength={100} placeholder="Ada & Tunde's Wedding" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="description">Message to guests <span className="font-normal text-muted">(optional)</span></label>
              <textarea id="description" className="input min-h-28" maxLength={2000} placeholder="Thank you for celebrating with us…" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="space-y-4">
            <p className="text-sm text-muted">
              Set each target in USDC (1 USDC ≈ US$1). A general cash gift is always included, so you can skip this and
              just collect cash. Each gift stops accepting contributions once its target is met.
            </p>
            {gifts.map((g, i) => (
              <div key={g.key} className="card space-y-3 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="font-condensed text-lg tracking-wide text-muted">Gift {String(i + 1).padStart(2, "0")}</span>
                  <button type="button" className="btn-danger px-3 py-1" onClick={() => setGifts((gs) => gs.filter((x) => x.key !== g.key))}>
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
            ))}
            {gifts.length < MAX_GIFTS && (
              <button type="button" className="w-full rounded-[1.75rem] border-2 border-dashed border-line py-4 text-sm font-semibold text-muted hover:border-gold-dark hover:text-ink" onClick={() => setGifts((gs) => [...gs, emptyGift()])}>
                + Add a gift
              </button>
            )}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset disabled={busy} className="space-y-6">
            <div className="card p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="rounded-full bg-gold/30 px-3 py-1 text-xs font-semibold tracking-wide uppercase">{OCCASIONS[occasion]}</span>
                  <h2 className="heading-section mt-4 break-words">{title}</h2>
                  <p className="mt-2 text-sm text-muted">from <strong className="text-ink">{displayName}</strong></p>
                </div>
                <button type="button" className="shrink-0 text-sm font-semibold underline-offset-4 hover:underline" onClick={() => goTo(0)}>Edit</button>
              </div>
              {description && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-ink/80">{description}</p>}
            </div>

            <div className="card p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h3 className="heading-card">Gifts</h3>
                <button type="button" className="text-sm font-semibold underline-offset-4 hover:underline" onClick={() => goTo(1)}>Edit</button>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {giftList.map((g, i) => (
                  <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                    <span className="truncate">{g.name}</span>
                    <span className="shrink-0 font-semibold">{formatUsdc(g.target, { decimals: 2 })} USDC</span>
                  </li>
                ))}
                <li className="flex justify-between gap-4 py-3 text-sm">
                  <span className="text-muted">General cash gift</span>
                  <span className="shrink-0 text-muted">Any amount</span>
                </li>
              </ul>
              {giftList.length > 0 && (
                <p className="mt-2 flex justify-between border-t border-line pt-4 text-sm">
                  <span className="text-muted">Total of gift targets</span>
                  <span className="font-condensed text-2xl tracking-wide">{formatUsdc(total, { decimals: 2 })} USDC</span>
                </p>
              )}
            </div>

            {status.kind === "saveFailed" ? (
              <div className="card space-y-3 p-6 text-sm">
                <p>
                  Your registry <strong>#{status.id.toString()}</strong> was created on Arc, but saving its details failed:{" "}
                  <span className="text-danger">{status.error}</span>
                </p>
                <button type="button" className="btn-primary" onClick={() => save(status.id, status.json, status.hash)}>
                  Try saving again
                </button>
              </div>
            ) : !mounted ? null : !isConnected || chainId !== chain.id ? (
              <div className="card flex flex-col items-center gap-4 p-6 text-center sm:p-8">
                <p className="text-sm text-muted">Connect the wallet that should receive the gifts. Only this wallet can withdraw.</p>
                <ConnectButton />
              </div>
            ) : null}
          </fieldset>
        )}

        {formError && <p className="mt-6 rounded-2xl bg-danger-soft p-4 text-sm text-danger">{formError}</p>}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 0 ? (
            <button type="button" className="btn-secondary px-6 py-3" disabled={busy} onClick={() => goTo(step - 1)}>← Back</button>
          ) : <span />}
          {step < 2 ? (
            <button type="submit" className="btn-primary px-8 py-3 text-base">Continue →</button>
          ) : mounted && isConnected && chainId === chain.id && status.kind !== "saveFailed" ? (
            <button type="submit" className="btn-primary px-8 py-3 text-base" disabled={busy}>
              {status.kind === "wallet" && "Confirm in your wallet…"}
              {status.kind === "pending" && "Creating on Arc…"}
              {status.kind === "saving" && "Saving details…"}
              {status.kind === "idle" && "Create registry"}
            </button>
          ) : null}
        </div>
        {step === 2 && (
          <div className="mt-3 space-y-1 sm:text-right">
            {status.kind === "pending" && <TxLink hash={status.hash} />}
            <p className="text-xs text-muted">One transaction on Arc. The network fee is a fraction of a cent, paid in USDC.</p>
          </div>
        )}
      </form>

      {status.kind === "done" && <CreatedModal slug={status.slug} hash={status.hash} />}
    </>
  );
}

const STEP_LABELS = ["The occasion", "Your wishes", "Review & create"];

function Steps({ current, onPick }: { current: number; onPick: (i: number) => void }) {
  return (
    <ol className="mt-10 grid grid-cols-3 gap-3">
      {STEP_LABELS.map((label, i) => (
        <li key={label}>
          <button type="button" onClick={() => onPick(i)} disabled={i >= current} className="block w-full text-left disabled:cursor-default">
            <span className={`block h-1.5 rounded-full transition-colors ${i <= current ? "bg-night" : "bg-line"}`} />
            <span className={`mt-3 flex items-baseline gap-2 ${i === current ? "text-ink" : "text-muted"}`}>
              <span className="font-condensed text-lg tracking-wide">0{i + 1}</span>
              <span className="hidden text-sm font-semibold sm:inline">{label}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function TxLink({ hash }: { hash: Hash }) {
  const url = explorerTx(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block text-xs text-ink underline">
      View transaction on the Arc explorer
    </a>
  ) : null;
}

/** Shown once the registry exists onchain and its details are saved. Closing goes to the dashboard. */
function CreatedModal({ slug, hash }: { slug: string; hash: Hash }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${slug}`;
  const close = () => router.push(`/dashboard/${slug}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(`/dashboard/${slug}`);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, slug]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="created-title"
        className="w-full max-w-lg rounded-t-[1.75rem] bg-paper p-7 text-center shadow-2xl sm:rounded-[1.75rem] sm:p-9"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold text-2xl text-ink">✓</div>
        <h2 id="created-title" className="heading-section mt-5">Your registry is live</h2>
        <p className="mt-2 text-sm text-muted">Share this link with your guests:</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input readOnly className="input text-center text-sm sm:text-left" value={url} onFocus={(e) => e.target.select()} />
          <button className="btn-secondary shrink-0" onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
          }}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={`/dashboard/${slug}`} className="btn-primary px-6 py-3">Go to your dashboard</Link>
          <Link href={`/r/${slug}`} className="btn-secondary px-6 py-3">View as a guest</Link>
        </div>
        <div className="mt-4"><TxLink hash={hash} /></div>
      </div>
    </div>
  );
}
