import { formatUsdc, percent } from "@/lib/format";
import type { RegistryMetadata } from "@/lib/metadata";
import { ProgressBar } from "./ProgressBar";

/**
 * One gift as a photo card, shared by the guest registry page and the owner's dashboard so both
 * see the same thing. `action` is the guest's Contribute button; owners get none.
 */
export function GiftTile({ gift, target, raised, action }: {
  gift: RegistryMetadata["gifts"][number]; target: bigint; raised: bigint; action?: React.ReactNode;
}) {
  const pct = Math.floor(percent(raised, target));
  const complete = raised >= target;
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative h-48 bg-paper">
        {gift.imageUrl ? (
          // Owner-supplied links on arbitrary hosts, so next/image's domain allowlist doesn't fit.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gift.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-paper to-gold/35 font-condensed text-7xl text-ink/30">
            {gift.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className={`absolute top-3 right-3 grid h-16 w-16 rotate-6 place-items-center rounded-full text-center leading-none shadow-md ${
            complete ? "bg-night text-paper" : "bg-gold text-ink"
          }`}
        >
          {complete ? (
            <span className="text-xs font-bold uppercase">Funded</span>
          ) : (
            <span>
              <span className="block font-condensed text-xl">{pct}%</span>
              <span className="block text-[10px] font-semibold uppercase">funded</span>
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="heading-card">{gift.name}</h3>
          <p className="shrink-0 text-right">
            <span className="font-condensed text-2xl tracking-wide">{formatUsdc(target, { decimals: 2 })}</span>
            <span className="ml-1 text-xs text-muted">USDC</span>
          </p>
        </div>
        {gift.description && <p className="mt-1 text-sm text-muted">{gift.description}</p>}
        <div className="mt-auto pt-5">
          <ProgressBar raised={raised} target={target} />
          <p className="mt-2 flex justify-between text-xs text-muted">
            <span><strong className="text-ink">{formatUsdc(raised, { decimals: 2 })}</strong> raised</span>
            <span>{complete ? "Complete" : `${formatUsdc(target - raised, { decimals: 2 })} to go`}</span>
          </p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </article>
  );
}
