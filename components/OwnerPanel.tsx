"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Hash } from "viem";
import { useConfig } from "wagmi";
import { explorerTx, REGISTRY_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatUsdc, shortAddress } from "@/lib/format";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import { sendContractTx } from "@/lib/tx";

type Registry = {
  generalRaised: bigint;
  owner: `0x${string}`;
  pendingOwner: `0x${string}`;
  closed: boolean;
  totalRaised: bigint;
  totalWithdrawn: bigint;
};

type TxState = { busy: string | null; hash: Hash | null; error: string | null; done: string | null };

/** Runs one owner action at a time: prevents double submits, tracks the tx and errors. */
function useOwnerTx(onDone: () => void) {
  const config = useConfig();
  const running = useRef(false);
  const [state, setState] = useState<TxState>({ busy: null, hash: null, error: null, done: null });

  async function run(
    label: string,
    successMessage: string,
    call: Parameters<typeof sendContractTx>[1],
  ): Promise<boolean> {
    if (running.current || !REGISTRY_ADDRESS) return false;
    running.current = true;
    setState({ busy: `${label}: confirm in your wallet…`, hash: null, error: null, done: null });
    try {
      const receipt = await sendContractTx(config, call, (hash) =>
        setState((s) => ({ ...s, busy: `${label}…`, hash })),
      );
      setState({ busy: null, hash: receipt.transactionHash, error: null, done: successMessage });
      onDone();
      return true;
    } catch (e) {
      setState((s) => ({ ...s, busy: null, error: friendlyError(e) }));
      return false;
    } finally {
      running.current = false;
    }
  }

  return { state, run };
}

function TxStatus({ state }: { state: TxState }) {
  const url = state.hash ? explorerTx(state.hash) : null;
  return (
    <div className="mt-3 space-y-1 text-sm">
      {state.busy && <p className="text-muted">{state.busy}</p>}
      {state.done && <p className="font-medium text-ink">✓ {state.done}</p>}
      {state.error && <p className="text-danger">{state.error}</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs underline">
          View transaction
        </a>
      )}
    </div>
  );
}

/** Big "ready to withdraw" card, styled like a balance card. Withdraws everything to the connected wallet. */
export function BalanceCard({ registryId, registry, slug, onDone }: {
  registryId: bigint; registry: Registry; slug: string; onDone: () => void;
}) {
  const { state, run } = useOwnerTx(onDone);
  const [copied, setCopied] = useState(false);
  const available = registry.totalRaised - registry.totalWithdrawn;
  const busy = state.busy !== null;

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-night p-6 text-paper sm:p-8">
      {/* Soft gold arcs in the corner, echoing the landing page's gold accents. */}
      <svg className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 text-gold/25" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        {[40, 60, 80, 100].map((r) => <circle key={r} cx="200" cy="0" r={r * 1.6} stroke="currentColor" strokeWidth="1" />)}
      </svg>
      <p className="relative text-xs font-semibold tracking-[0.14em] text-gold uppercase">Ready to withdraw</p>
      <p className="relative mt-3 flex items-baseline gap-2">
        <span className="font-condensed text-6xl tracking-wide sm:text-7xl">{formatUsdc(available, { decimals: 2 })}</span>
        <span className="text-sm font-semibold text-paper/60">USDC</span>
      </p>
      <div className="relative mt-6 flex flex-wrap gap-3">
        <button
          className="btn-primary px-6 py-3 text-base"
          disabled={available === 0n || busy}
          onClick={() =>
            run("Withdrawing", `${formatUsdc(available, { decimals: 2 })} USDC sent to your wallet.`, {
              address: REGISTRY_ADDRESS!,
              abi: giftRegistryAbi,
              functionName: "withdraw",
              args: [registryId],
            })
          }
        >
          {available === 0n ? "Nothing to withdraw yet" : "Withdraw to my wallet"}
        </button>
        <button
          className="btn border border-white/30 px-6 py-3 text-base text-paper hover:bg-white/10"
          disabled={registry.closed}
          title={registry.closed ? "Reopen the registry to share it again" : undefined}
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/r/${slug}`).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {registry.closed ? "Closed: can't share" : copied ? "Link copied!" : "Share link"}
        </button>
      </div>
      <div className="relative [&_a]:text-paper/80 [&_p]:text-paper/80">
        <TxStatus state={state} />
      </div>
      <dl className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
        <Figure label="Received" value={registry.totalRaised} />
        <Figure label="Withdrawn" value={registry.totalWithdrawn} />
        <Figure label="Cash gifts" value={registry.generalRaised} />
      </dl>
      <p className="relative mt-5 text-xs text-paper/60">
        Withdraw whenever you like. Gifts don&apos;t need to reach their target first, and guests still see each
        gift&apos;s progress afterwards. Only your wallet can withdraw.
      </p>
    </section>
  );
}

/** Settings-style list of the less common owner actions; each row opens its form inline. */
export function ManageCard({ registryId, registry, slug, onDone }: {
  registryId: bigint; registry: Registry; slug: string; onDone: () => void;
}) {
  const { state, run } = useOwnerTx(onDone);
  const [mode, setMode] = useState<null | "elsewhere" | "transfer" | "close">(null);
  const [recipient, setRecipient] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const available = registry.totalRaised - registry.totalWithdrawn;
  const busy = state.busy !== null;
  const hasPending = registry.pendingOwner !== zeroAddress;
  const address = REGISTRY_ADDRESS!;

  // The contract also rejects these: the registry itself and the USDC contract can't receive withdrawals.
  const recipientForbidden =
    isAddress(recipient.trim()) && [zeroAddress, address, USDC_ADDRESS].some((a) => getAddress(recipient.trim()) === getAddress(a));
  const recipientValid = isAddress(recipient.trim()) && !recipientForbidden;
  const newOwnerValid =
    isAddress(newOwner.trim()) && newOwner.trim() !== zeroAddress && getAddress(newOwner.trim()) !== getAddress(registry.owner);

  return (
    <section className="card p-3">
      <p className="eyebrow px-3 pt-3 pb-2">Manage</p>
      <ul>
        <li>
          <Link href={`/r/${slug}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-paper">
            <RowIcon name="eye" />
            <span className="flex-1 text-sm font-semibold">View as a guest</span>
            <Arrow />
          </Link>
        </li>
        <ActionRow icon="wallet" label="Withdraw to another wallet" open={mode === "elsewhere"}
          disabled={busy || available === 0n} onClick={() => setMode(mode === "elsewhere" ? null : "elsewhere")} />
        {mode === "elsewhere" && (
          <li className="space-y-2 px-3 pb-4">
            <label className="label" htmlFor="recipient">Send all available USDC to</label>
            <input id="recipient" className="input font-mono text-sm" placeholder="0x…" value={recipient}
              disabled={busy} onChange={(e) => setRecipient(e.target.value)} />
            {recipientForbidden && <p className="text-xs text-danger">That address can&apos;t receive withdrawals. Use a personal wallet address.</p>}
            <p className="text-xs text-muted">Double-check the address: transfers can&apos;t be reversed.</p>
            <button className="btn-primary w-full" disabled={!recipientValid || available === 0n || busy}
              onClick={async () => {
                const to = getAddress(recipient.trim());
                const ok = await run("Withdrawing", `${formatUsdc(available, { decimals: 2 })} USDC sent to ${shortAddress(to)}.`, {
                  address, abi: giftRegistryAbi, functionName: "withdrawTo", args: [registryId, to],
                });
                if (ok) setMode(null);
              }}>
              Withdraw {formatUsdc(available, { decimals: 2 })} USDC there
            </button>
          </li>
        )}

        <ActionRow icon="transfer" label="Transfer ownership" open={mode === "transfer"} disabled={busy}
          onClick={() => setMode(mode === "transfer" ? null : "transfer")} />
        {mode === "transfer" && (
          <li className="space-y-2 px-3 pb-4">
            <label className="label" htmlFor="newOwner">New owner wallet</label>
            <input id="newOwner" className="input font-mono text-sm" placeholder="0x…" value={newOwner}
              disabled={busy} onChange={(e) => setNewOwner(e.target.value)} />
            <p className="text-xs text-muted">
              The new wallet must open this registry and accept. Until then you stay the owner. After it accepts, it can
              withdraw everything not yet withdrawn, and you no longer can.
            </p>
            <button className="btn-primary w-full" disabled={!newOwnerValid || busy}
              onClick={async () => {
                const to = getAddress(newOwner.trim());
                const ok = await run("Proposing new owner", `Transfer proposed. ${shortAddress(to)} must now accept it.`, {
                  address, abi: giftRegistryAbi, functionName: "transferRegistryOwnership", args: [registryId, to],
                });
                if (ok) setMode(null);
              }}>
              Propose transfer
            </button>
          </li>
        )}

        {/* Last, and red: closing stops new gifts, so it asks for confirmation first. Reopening doesn't. */}
        {registry.closed ? (
          <ActionRow icon="unlock" label="Reopen registry" hint="Start accepting gifts again" disabled={busy}
            onClick={() =>
              run("Reopening", "Registry reopened to new gifts.",
                { address, abi: giftRegistryAbi, functionName: "setRegistryClosed", args: [registryId, false] })
            } />
        ) : (
          <ActionRow icon="lock" label="Close registry" hint="Stop new gifts. You can still withdraw" danger
            open={mode === "close"} disabled={busy} onClick={() => setMode(mode === "close" ? null : "close")} />
        )}
        {mode === "close" && !registry.closed && (
          <li className="mx-3 mb-3 space-y-3 rounded-2xl bg-danger-soft p-4">
            <p className="text-sm font-semibold text-danger">Close this registry?</p>
            <p className="text-xs text-ink/75">
              Guests won&apos;t be able to send new gifts. Everything already given stays yours to withdraw, and you can
              reopen it at any time.
            </p>
            <div className="flex gap-2">
              <button className="btn flex-1 bg-danger text-white hover:bg-danger/90" disabled={busy}
                onClick={async () => {
                  const ok = await run("Closing", "Registry closed to new gifts. You can still withdraw.",
                    { address, abi: giftRegistryAbi, functionName: "setRegistryClosed", args: [registryId, true] });
                  if (ok) setMode(null);
                }}>
                Yes, close it
              </button>
              <button className="btn-secondary flex-1" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
            </div>
          </li>
        )}
      </ul>

      {hasPending && (
        <div className="m-3 space-y-2 rounded-2xl bg-paper p-4 text-sm">
          <p>Waiting for <span className="font-mono">{shortAddress(registry.pendingOwner)}</span> to accept ownership.</p>
          <button className="btn-danger px-0 py-0" disabled={busy}
            onClick={() => run("Cancelling transfer", "Transfer cancelled.", {
              address, abi: giftRegistryAbi, functionName: "transferRegistryOwnership", args: [registryId, zeroAddress],
            })}>
            Cancel transfer
          </button>
        </div>
      )}
      <div className="px-3 pb-2"><TxStatus state={state} /></div>
    </section>
  );
}

function ActionRow({ icon, label, hint, open, disabled, danger, onClick }: {
  icon: IconName; label: string; hint?: string; open?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <li>
      <button onClick={onClick} disabled={disabled} aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
          danger ? "text-danger hover:bg-danger-soft" : "hover:bg-paper"
        }`}>
        <RowIcon name={icon} danger={danger} />
        <span className="flex-1">
          <span className="block text-sm font-semibold">{label}</span>
          {hint && <span className={`block text-xs ${danger ? "text-danger/75" : "text-muted"}`}>{hint}</span>}
        </span>
        <Arrow open={open} />
      </button>
    </li>
  );
}

type IconName = "wallet" | "lock" | "unlock" | "transfer" | "eye";
const ICONS: Record<IconName, string> = {
  wallet: "M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 0 1-2h11M15 13h2",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  unlock: "M7 11V8a5 5 0 0 1 9.6-2M6 11h12v9H6z",
  transfer: "M4 8h13l-3-3M20 16H7l3 3",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
};

function RowIcon({ name, danger }: { name: IconName; danger?: boolean }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ${danger ? "bg-danger-soft ring-danger/30" : "bg-paper ring-line"}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[name]} />
      </svg>
    </span>
  );
}

function Arrow({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Shown to the wallet the owner proposed as the new owner. */
export function PendingOwnerBanner({ registryId, onDone }: { registryId: bigint; onDone: () => void }) {
  const { state, run } = useOwnerTx(onDone);
  return (
    <section className="mt-8 rounded-3xl border border-gold/40 bg-gold/10 p-6">
      <p className="font-semibold">You&apos;ve been invited to take over this registry.</p>
      <p className="mt-1 text-sm text-muted">
        Accepting makes your connected wallet the owner. You&apos;ll be able to withdraw everything that hasn&apos;t been
        withdrawn yet.
      </p>
      <button
        className="btn-primary mt-4"
        disabled={state.busy !== null}
        onClick={() =>
          run("Accepting ownership", "You're now the owner of this registry.", {
            address: REGISTRY_ADDRESS!,
            abi: giftRegistryAbi,
            functionName: "acceptRegistryOwnership",
            args: [registryId],
          })
        }
      >
        Accept ownership
      </button>
      <TxStatus state={state} />
    </section>
  );
}

function Figure({ label, value }: { label: string; value: bigint }) {
  return (
    <div>
      <dt className="text-paper/60">{label}</dt>
      <dd className="font-condensed text-2xl tracking-wide">{formatUsdc(value, { decimals: 2 })}</dd>
    </div>
  );
}

/**
 * Compact "Withdraw" for a registry row in the dashboard overview. Sends everything available
 * to the owner's connected wallet; the full panel on the registry page has the other options.
 */
export function WithdrawButton({ registryId, available, onDone }: { registryId: bigint; available: bigint; onDone: () => void }) {
  const { state, run } = useOwnerTx(onDone);
  const busy = state.busy !== null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-primary px-4 py-2"
        disabled={available === 0n || busy}
        onClick={() =>
          run("Withdrawing", `${formatUsdc(available, { decimals: 2 })} USDC sent to your wallet.`, {
            address: REGISTRY_ADDRESS!,
            abi: giftRegistryAbi,
            functionName: "withdraw",
            args: [registryId],
          })
        }
      >
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
      {(state.error || state.done || state.busy) && (
        <p className={`max-w-48 text-right text-xs ${state.error ? "text-danger" : "text-muted"}`}>{state.error ?? state.done ?? state.busy}</p>
      )}
    </div>
  );
}
