"use client";

import { useEffect, useRef, useState } from "react";
import { erc20Abi, isAddressEqual, parseEventLogs, type Hash } from "viem";
import { useConfig, useConnection, useReadContract } from "wagmi";
import { chain, explorerAddress, explorerTx, MIN_AMOUNT, REGISTRY_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatNgn, formatUsdc, parseUsdcInput, shortAddress, usdcToNgn } from "@/lib/format";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import type { RegistryMetadata } from "@/lib/metadata";
import { sendContractTx } from "@/lib/tx";
import { ConnectButton } from "./ConnectButton";

export type ContributeTarget = { giftId: bigint; name: string; remaining: bigint | null };

type Status =
  | { kind: "idle" }
  | { kind: "approve-wallet" }
  | { kind: "approve-pending"; hash: Hash }
  | { kind: "contribute-wallet" }
  | { kind: "contribute-pending"; hash: Hash }
  | { kind: "success"; hash: Hash; amount: bigint };

/** Leave this much USDC for the network fee, which Arc charges in USDC. */
const FEE_BUFFER = 20_000n;

export function ContributeDialog({ registryId, target, metadata, onClose, onConfirmed }: {
  registryId: bigint;
  target: ContributeTarget;
  metadata: RegistryMetadata;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const config = useConfig();
  const { address, isConnected, chainId } = useConnection();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [noteWarning, setNoteWarning] = useState<string | null>(null);
  const running = useRef(false);

  const balance = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined,
    chainId: chain.id, query: { enabled: !!address },
  });
  const allowance = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: "allowance",
    args: address && REGISTRY_ADDRESS ? [address, REGISTRY_ADDRESS] : undefined,
    chainId: chain.id, query: { enabled: !!address && !!REGISTRY_ADDRESS },
  });

  const busy = status.kind !== "idle" && status.kind !== "success";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const amount = parseUsdcInput(input);
  const rate = metadata.ngnPerUsdc;
  let amountError: string | null = null;
  if (input && amount === null) amountError = "Enter an amount like 25 or 12.50";
  else if (amount !== null && amount < MIN_AMOUNT) amountError = "The minimum is 0.01 USDC";
  else if (amount !== null && target.remaining !== null && amount > target.remaining)
    amountError = `This gift only needs ${formatUsdc(target.remaining, { decimals: 2 })} USDC more`;
  const insufficient = amount !== null && balance.data !== undefined && balance.data < amount;
  const tightOnFees = amount !== null && balance.data !== undefined && !insufficient && balance.data - amount < FEE_BUFFER;
  const needsApproval = amount !== null && (allowance.data ?? 0n) < amount;
  const wrongChain = isConnected && chainId !== chain.id;
  const canSubmit = !!amount && !amountError && !insufficient && !busy && !!REGISTRY_ADDRESS;

  async function submit() {
    if (!canSubmit || running.current || !amount || !REGISTRY_ADDRESS || !address) return;
    const sender = address;
    const contract = REGISTRY_ADDRESS;
    running.current = true;
    setError(null);
    try {
      if (needsApproval) {
        // Approve exactly this amount, never an unlimited allowance.
        setStatus({ kind: "approve-wallet" });
        await sendContractTx(config, { address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [REGISTRY_ADDRESS, amount] },
          (hash) => setStatus({ kind: "approve-pending", hash }));
        await allowance.refetch();
      }
      setStatus({ kind: "contribute-wallet" });
      const receipt = await sendContractTx(config,
        { address: REGISTRY_ADDRESS, abi: giftRegistryAbi, functionName: "contribute", args: [registryId, target.giftId, amount] },
        (hash) => setStatus({ kind: "contribute-pending", hash }));

      // Only report success once the confirmed receipt contains the expected event.
      const verified = parseEventLogs({ abi: giftRegistryAbi, eventName: "Contributed", logs: receipt.logs }).some((e) =>
        isAddressEqual(e.address, contract) && e.args.registryId === registryId && e.args.giftId === target.giftId &&
        e.args.amount === amount && isAddressEqual(e.args.contributor, sender));
      if (!verified) throw new Error("The transaction confirmed but no matching contribution was found. Please check the explorer.");

      setStatus({ kind: "success", hash: receipt.transactionHash, amount });
      onConfirmed();
      balance.refetch();
      fetch(`/api/registries/${registryId}/contributions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash: receipt.transactionHash, name, message }),
      }).then((r) => {
        if (!r.ok) setNoteWarning("Your gift is confirmed, but your note couldn't be saved.");
        onConfirmed();
      }).catch(() => setNoteWarning("Your gift is confirmed, but your note couldn't be saved."));
    } catch (e) {
      setError(friendlyError(e));
      setStatus({ kind: "idle" });
      allowance.refetch();
    } finally {
      running.current = false;
    }
  }

  const pendingHash = status.kind === "approve-pending" || status.kind === "contribute-pending" ? status.hash : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="contribute-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Contribute to</p>
            <h2 id="contribute-title" className="font-display text-2xl font-semibold">{target.name}</h2>
          </div>
          <button className="text-2xl leading-none text-muted hover:text-ink disabled:opacity-30" disabled={busy} onClick={onClose} aria-label="Close">×</button>
        </div>

        {status.kind === "success" ? (
          <div className="mt-6 space-y-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sage-soft text-xl text-sage">✓</div>
            <p className="font-display text-xl font-semibold">Thank you! Your gift of {formatUsdc(status.amount, { decimals: 2 })} USDC is confirmed.</p>
            <p className="text-sm text-muted">It&apos;s been recorded on Arc and {metadata.displayName} can now withdraw it.</p>
            {noteWarning && <p className="text-xs text-accent-dark">{noteWarning}</p>}
            {explorerTx(status.hash) && <a className="block text-sm text-accent underline" href={explorerTx(status.hash)!} target="_blank" rel="noreferrer">View transaction</a>}
            <button className="btn-primary w-full" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="amount">Amount (USDC)</label>
              <div className="relative">
                <input id="amount" className="input pr-16 text-lg" inputMode="decimal" autoFocus placeholder="0.00"
                  value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} />
                <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">USDC</span>
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-xs text-muted">
                <span>{amountError ? <span className="text-accent-dark">{amountError}</span>
                  : amount && rate ? `≈ ${formatNgn(usdcToNgn(amount, rate))} at the owner's rate` : "1 USDC ≈ US$1"}</span>
                {target.remaining !== null && (
                  <button type="button" className="underline" disabled={busy} onClick={() => setInput(formatUsdc(target.remaining!, { decimals: 2 }).replace(/,/g, ""))}>
                    Remaining: {formatUsdc(target.remaining, { decimals: 2 })}
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3">
              <input className="input" placeholder="Your name (optional)" maxLength={60} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
              <textarea className="input min-h-16" placeholder="Add a note (optional)" maxLength={280} value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} />
            </div>

            <dl className="space-y-1.5 rounded-2xl bg-paper p-4 text-sm">
              <Row label="You send">{amount && !amountError ? `${formatUsdc(amount, { decimals: 2 })} USDC` : "-"}</Row>
              <Row label="For">{metadata.displayName}</Row>
              <Row label="Held by contract">
                <Addr address={REGISTRY_ADDRESS} />
              </Row>
              <Row label="Network">{chain.name}</Row>
              <Row label="Network fee">&lt; $0.01, paid in USDC</Row>
              {isConnected && balance.data !== undefined && <Row label="Your balance">{formatUsdc(balance.data, { decimals: 2 })} USDC</Row>}
            </dl>
            <p className="text-xs text-muted">
              Funds are held by the registry contract until {metadata.displayName} withdraws them. Contributions can&apos;t be
              reversed by the app.
            </p>

            {insufficient && <p className="text-sm text-accent-dark">You don&apos;t have enough USDC in this wallet.</p>}
            {tightOnFees && <p className="text-xs text-accent-dark">Keep a few cents of USDC extra for the network fee.</p>}
            {error && <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent-dark">{error}</p>}

            {!isConnected || wrongChain ? (
              <div className="flex justify-center"><ConnectButton /></div>
            ) : (
              <button className="btn-primary w-full py-3 text-base" disabled={!canSubmit} onClick={submit}>
                {status.kind === "approve-wallet" && "Step 1 of 2: approve in your wallet…"}
                {status.kind === "approve-pending" && "Step 1 of 2: confirming approval…"}
                {status.kind === "contribute-wallet" && `${needsApproval ? "Step 2 of 2: " : ""}confirm the gift in your wallet…`}
                {status.kind === "contribute-pending" && "Sending your gift on Arc…"}
                {status.kind === "idle" && (amount && needsApproval && !amountError ? "Approve & send gift (2 steps)" : "Send gift")}
              </button>
            )}
            {pendingHash && explorerTx(pendingHash) && (
              <a className="block text-center text-xs text-accent underline" href={explorerTx(pendingHash)!} target="_blank" rel="noreferrer">
                Track transaction on the Arc explorer
              </a>
            )}
            {needsApproval && status.kind === "idle" && amount && !amountError && (
              <p className="text-center text-xs text-muted">First you allow the registry to take exactly this amount of USDC, then you send it.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Addr({ address }: { address?: `0x${string}` }) {
  if (!address) return <>-</>;
  const url = explorerAddress(address);
  return url ? <a className="underline" href={url} target="_blank" rel="noreferrer">{shortAddress(address)}</a> : <>{shortAddress(address)}</>;
}
