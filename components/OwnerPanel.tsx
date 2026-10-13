"use client";

import { useRef, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Hash } from "viem";
import { useConfig } from "wagmi";
import { explorerTx, REGISTRY_ADDRESS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatUsdc, shortAddress } from "@/lib/format";
import { giftRegistryAbi } from "@/lib/giftRegistryAbi";
import { sendContractTx } from "@/lib/tx";

type Registry = {
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
      {state.done && <p className="text-sage">✓ {state.done}</p>}
      {state.error && <p className="text-accent-dark">{state.error}</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs underline">
          View transaction
        </a>
      )}
    </div>
  );
}

export function OwnerPanel({ registryId, registry, onDone }: { registryId: bigint; registry: Registry; onDone: () => void }) {
  const { state, run } = useOwnerTx(onDone);
  const [mode, setMode] = useState<null | "elsewhere" | "transfer">(null);
  const [recipient, setRecipient] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const available = registry.totalRaised - registry.totalWithdrawn;
  const busy = state.busy !== null;
  const hasPending = registry.pendingOwner !== zeroAddress;
  const address = REGISTRY_ADDRESS!;

  const recipientValid = isAddress(recipient.trim()) && recipient.trim() !== zeroAddress;
  const newOwnerValid =
    isAddress(newOwner.trim()) && newOwner.trim() !== zeroAddress && getAddress(newOwner.trim()) !== getAddress(registry.owner);

  return (
    <section className="mt-8 rounded-3xl border border-sage/30 bg-sage-soft/50 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-sage uppercase">Your registry</p>
          <div className="mt-2 grid grid-cols-3 gap-6 text-sm">
            <Figure label="Total given" value={registry.totalRaised} />
            <Figure label="Withdrawn" value={registry.totalWithdrawn} />
            <Figure label="Available" value={available} strong />
          </div>
        </div>
        <button
          className="btn-primary bg-sage hover:bg-sage/90"
          disabled={available === 0n || busy}
          onClick={() =>
            run("Withdrawing", `${formatUsdc(available, { decimals: 2 })} USDC sent to your wallet.`, {
              address,
              abi: giftRegistryAbi,
              functionName: "withdraw",
              args: [registryId],
            })
          }
        >
          {available === 0n ? "Nothing to withdraw" : `Withdraw ${formatUsdc(available, { decimals: 2 })} USDC`}
        </button>
      </div>
      <p className="mt-4 text-xs text-muted">
        You can withdraw whenever you like. Gifts don&apos;t need to reach their target first. Withdrawing sends all
        available USDC to your connected wallet, and guests still see each gift&apos;s progress afterwards. Only your
        wallet can withdraw, and the contract enforces this.
      </p>

      <TxStatus state={state} />

      <div className="mt-5 flex flex-wrap gap-2 border-t border-sage/20 pt-4 text-sm">
        <button className="btn-secondary px-4 py-1.5" disabled={busy || available === 0n}
          onClick={() => setMode(mode === "elsewhere" ? null : "elsewhere")}>
          Withdraw to another wallet
        </button>
        <button
          className="btn-secondary px-4 py-1.5"
          disabled={busy}
          onClick={() =>
            run(
              registry.closed ? "Reopening" : "Closing",
              registry.closed ? "Registry reopened to new gifts." : "Registry closed to new gifts. You can still withdraw.",
              { address, abi: giftRegistryAbi, functionName: "setRegistryClosed", args: [registryId, !registry.closed] },
            )
          }
        >
          {registry.closed ? "Reopen registry" : "Close registry"}
        </button>
        <button className="btn-secondary px-4 py-1.5" disabled={busy}
          onClick={() => setMode(mode === "transfer" ? null : "transfer")}>
          Transfer to another wallet
        </button>
      </div>

      {mode === "elsewhere" && (
        <div className="mt-4 space-y-2 rounded-2xl bg-card p-4">
          <label className="label" htmlFor="recipient">Send all available USDC to</label>
          <input id="recipient" className="input font-mono text-sm" placeholder="0x…" value={recipient}
            disabled={busy} onChange={(e) => setRecipient(e.target.value)} />
          <p className="text-xs text-muted">
            Use this if your own wallet can&apos;t receive USDC. Double-check the address: transfers can&apos;t be reversed.
          </p>
          <button
            className="btn-primary"
            disabled={!recipientValid || available === 0n || busy}
            onClick={async () => {
              const to = getAddress(recipient.trim());
              const ok = await run("Withdrawing", `${formatUsdc(available, { decimals: 2 })} USDC sent to ${shortAddress(to)}.`, {
                address,
                abi: giftRegistryAbi,
                functionName: "withdrawTo",
                args: [registryId, to],
              });
              if (ok) setMode(null);
            }}
          >
            Withdraw {formatUsdc(available, { decimals: 2 })} USDC there
          </button>
        </div>
      )}

      {mode === "transfer" && (
        <div className="mt-4 space-y-2 rounded-2xl bg-card p-4">
          <label className="label" htmlFor="newOwner">New owner wallet</label>
          <input id="newOwner" className="input font-mono text-sm" placeholder="0x…" value={newOwner}
            disabled={busy} onChange={(e) => setNewOwner(e.target.value)} />
          <p className="text-xs text-muted">
            The new wallet must open this registry page and accept. Until then you stay the owner. After it accepts, it can
            withdraw everything not yet withdrawn, and you no longer can.
          </p>
          <button
            className="btn-primary"
            disabled={!newOwnerValid || busy}
            onClick={async () => {
              const to = getAddress(newOwner.trim());
              const ok = await run("Proposing new owner", `Transfer proposed. ${shortAddress(to)} must now accept it on this page.`, {
                address,
                abi: giftRegistryAbi,
                functionName: "transferRegistryOwnership",
                args: [registryId, to],
              });
              if (ok) setMode(null);
            }}
          >
            Propose transfer
          </button>
        </div>
      )}

      {hasPending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 text-sm">
          <p>
            Waiting for <span className="font-mono">{shortAddress(registry.pendingOwner)}</span> to accept ownership.
          </p>
          <button
            className="btn-secondary px-4 py-1.5"
            disabled={busy}
            onClick={() =>
              run("Cancelling transfer", "Transfer cancelled.", {
                address,
                abi: giftRegistryAbi,
                functionName: "transferRegistryOwnership",
                args: [registryId, zeroAddress],
              })
            }
          >
            Cancel transfer
          </button>
        </div>
      )}
    </section>
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

function Figure({ label, value, strong }: { label: string; value: bigint; strong?: boolean }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className={strong ? "text-lg font-semibold" : "text-lg"}>{formatUsdc(value, { decimals: 2 })}</p>
    </div>
  );
}
