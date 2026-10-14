// Hand-drawn accents used on the landing page and in the brand mark. Decorative only.

type SvgProps = { className?: string; style?: React.CSSProperties };

/** Four-point wish star, the brand mark. */
export function WishStar({ className = "" }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 1.5c.6 4.9 2.6 7.9 9.5 9.5v1c-6.9 1.6-8.9 4.6-9.5 9.5h-1C10.4 16.6 8.4 13.6 1.5 12v-1C8.4 9.4 10.4 6.4 11 1.5h1Z" />
    </svg>
  );
}

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`grid h-8 w-8 place-items-center rounded-full ${tone === "dark" ? "bg-gold text-night" : "bg-accent text-white"}`}>
        <WishStar className="h-4 w-4" />
      </span>
      <span className="font-condensed text-xl tracking-wide uppercase">Your Wish</span>
    </span>
  );
}

/** Loose pen scribble that circles a word. Draws itself in on load, after `delay` seconds. */
export function Scribble({ className = "", delay = 0.4 }: SvgProps & { delay?: number }) {
  return (
    <svg viewBox="0 0 220 110" className={className} aria-hidden="true" fill="none">
      <path
        pathLength={1}
        className="animate-draw [stroke-dasharray:1]"
        style={{ animationDelay: `${delay}s` }}
        d="M178 22C150 6 72 4 34 24 6 39 2 70 30 86c34 19 120 20 158-2 26-15 30-44 6-60-26-17-96-21-140-6C42 22 30 30 26 40"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Squiggle({ className = "" }: SvgProps) {
  return (
    <svg viewBox="0 0 80 30" className={className} aria-hidden="true" fill="none">
      <path d="M2 22c10 0 14-16 24-16s8 18 18 18 10-18 20-18 10 10 14 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Asterisk({ className = "" }: SvgProps) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" fill="none">
      <path d="M20 3v34M5 11l30 18M35 11 5 29" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Wobbly-edged gift box with a white "sticker" border. */
export function GiftSticker({ className = "", style }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" className={className} style={style} aria-hidden="true">
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M24 58c-1-9 2-13 10-13l74-1c8 0 11 4 10 12l-1 9c0 4-3 6-7 6l1 41c0 9-4 13-13 13H44c-9 0-13-4-13-13l1-41c-5 0-8-2-8-6Z"
          fill="#fff"
          stroke="#fff"
          strokeWidth="18"
        />
        <path d="M33 70h76l-1 42c0 6-3 9-9 9H43c-6 0-9-3-9-9Z" fill="var(--color-accent-soft)" stroke="var(--color-ink)" strokeWidth="4" />
        <path d="M27 55c0-6 2-8 8-8h72c6 0 8 2 8 8v8c0 4-2 6-6 6H33c-4 0-6-2-6-6Z" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="4" />
        <path d="M71 47v74" stroke="var(--color-ink)" strokeWidth="4" />
        <path d="M70 46c-8-14-28-20-30-8-2 10 18 10 30 8Zm2 0c8-14 28-20 30-8 2 10-18 10-30 8Z" fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth="4" />
      </g>
    </svg>
  );
}

/** Spiky starburst sticker, like a sale badge drawn by hand. */
export function BurstSticker({ className = "", style }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" className={className} style={style} aria-hidden="true">
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M70 10c9 14 14 20 30 15-2 16 2 22 20 27-12 11-12 18-2 32-17 1-21 7-20 25-15-8-22-6-30 9-8-15-15-17-30-9 1-18-3-24-20-25 10-14 10-21-2-32 18-5 22-11 20-27 16 5 21-1 34-15Z"
          fill="var(--color-gold)"
          stroke="#fff"
          strokeWidth="10"
          paintOrder="stroke"
        />
        <path d="M70 38 76 62l24-4-20 14 12 22-22-14-22 14 12-22-20-14 24 4Z" fill="none" stroke="var(--color-ink)" strokeWidth="4" />
      </g>
    </svg>
  );
}
