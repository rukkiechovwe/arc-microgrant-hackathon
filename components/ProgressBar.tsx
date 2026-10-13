import { percent } from "@/lib/format";

export function ProgressBar({ raised, target }: { raised: bigint; target: bigint }) {
  const pct = percent(raised, target);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-line" role="progressbar"
      aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-sage" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
