import { explorerTx } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/format";
import type { RegistryMetadata } from "@/lib/metadata";
import type { ContributionNote } from "@/lib/useRegistry";

export function ContributionsList({
  notes, isLoading, gifts, title = "Gifts received", emptyText = "No gifts yet. Be the first to contribute!",
}: {
  notes: ContributionNote[] | undefined; isLoading: boolean; gifts: RegistryMetadata["gifts"]; title?: string; emptyText?: string;
}) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">Each entry is checked against its confirmed Arc transaction. Names and notes are written by the giver.</p>
      {isLoading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : !notes?.length ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-3xl border border-line bg-card">
          {notes.map((n) => {
            const url = explorerTx(n.txHash);
            const giftName = n.giftId === "general" ? "Cash gift" : gifts[Number(n.giftId)]?.name ?? `Gift ${n.giftId}`;
            return (
              <li key={`${n.txHash}-${n.giftId}-${n.amount}`} className="flex flex-col gap-1 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">{n.name || shortAddress(n.contributor)} <span className="font-normal text-muted">→ {giftName}</span></p>
                  {n.message && <p className="mt-1 text-sm text-muted italic">&ldquo;{n.message}&rdquo;</p>}
                </div>
                <div className="text-sm sm:text-right">
                  <p className="font-semibold">{formatUsdc(BigInt(n.amount), { decimals: 2 })} USDC</p>
                  {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">View on Arc</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
