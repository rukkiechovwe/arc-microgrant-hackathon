import Image from "next/image";

export type Wish = {
  name: string;
  image: string;
  raised: number;
  target: number;
  note: string;
};

/** A sample wishlist item: photo, name, USDC progress and how it's being funded. */
export function WishCard({ wish, delay = 0 }: { wish: Wish; delay?: number }) {
  const pct = Math.min(100, Math.round((wish.raised / wish.target) * 100));
  const funded = pct >= 100;
  return (
    <div className="w-44 rounded-2xl bg-paper p-2 text-ink shadow-[0_24px_48px_-16px_rgba(20,14,12,0.6)] ring-1 ring-night/5">
      <div className="relative h-24 overflow-hidden rounded-xl bg-stone">
        <Image src={wish.image} alt="" fill sizes="176px" className="object-cover" />
        {funded && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-sage px-2 py-0.5 text-[10px] font-semibold text-white">
            Fully funded
          </span>
        )}
      </div>
      <div className="px-1.5 pt-2.5 pb-1.5">
        <p className="truncate text-[13px] leading-tight font-semibold">{wish.name}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full animate-fill rounded-full ${funded ? "bg-sage" : "bg-accent"}`}
            style={{ width: `${pct}%`, animationDelay: `${delay + 0.3}s` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span><strong className="text-ink">{wish.raised.toLocaleString("en-US")}</strong> / {wish.target.toLocaleString("en-US")} USDC</span>
          <span>{pct}%</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted">{wish.note}</p>
      </div>
    </div>
  );
}
