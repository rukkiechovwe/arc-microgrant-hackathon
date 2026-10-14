import { Asterisk, Scribble, Squiggle } from "../Doodles";
import { delay } from "./motion";
import { Typed } from "./Typed";
import { HeroActions } from "./HeroActions";
import { WishCard, type Wish } from "./WishCard";

// Sample wishes (photos from Pexels, free to use: https://www.pexels.com/license/).
const wishes: Wish[] = [
  { name: "Wireless headphones", image: "/landing/headphones.jpg", raised: 180, target: 250, note: "4 friends chipped in" },
  { name: "Maldives honeymoon", image: "/landing/honeymoon.jpg", raised: 2150, target: 3000, note: "23 friends chipped in" },
  { name: "Signature perfume", image: "/landing/perfume.jpg", raised: 140, target: 140, note: "Bought outright by Aunt Bola" },
  { name: "DSLR camera", image: "/landing/camera.jpg", raised: 95, target: 320, note: "2 friends chipped in" },
  { name: "Reading armchair", image: "/landing/armchair.jpg", raised: 260, target: 400, note: "6 friends chipped in" },
  { name: "Classic watch", image: "/landing/watch.jpg", raised: 299, target: 299, note: "Bought outright by Kemi" },
];

// Desktop layout, in % of the hero box. Cards are 176px wide, about 13.75% of the 80rem container.
const spots = [
  { left: 0, top: 5, rotate: -6 },
  { left: 9, top: 36, rotate: 4 },
  { left: 1, top: 67, rotate: -3 },
  { left: 86.25, top: 4, rotate: 5 },
  { left: 77, top: 35, rotate: -4 },
  { left: 85, top: 66, rotate: 3 },
];

// Dashed "graph" edges between card centres and the floating chips, drawn in a 100×100 box.
const nodes = {
  l1: [7, 18], l2: [16, 49], l3: [8, 80], r1: [93, 17], r2: [84, 48], r3: [92, 79],
  tl: [30, 8], tr: [69, 11], bl: [33, 90], br: [68, 88],
} as const;
const edges: [keyof typeof nodes, keyof typeof nodes][] = [
  ["l1", "l2"], ["l2", "l3"], ["r1", "r2"], ["r2", "r3"], ["l1", "tl"], ["tl", "tr"], ["tr", "r1"],
  ["l3", "bl"], ["bl", "br"], ["br", "r3"], ["l2", "tl"], ["r2", "br"],
];

export function Hero() {
  return (
    // data-shown is set statically: the hero animates on load, not on scroll.
    <section className="relative overflow-hidden bg-night text-paper" data-shown="">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 xl:min-h-[50rem]">
        <Constellation />

        <div className="relative z-10 mx-auto flex max-w-[42rem] flex-col items-center pt-14 pb-12 text-center sm:pt-20 xl:pt-40 xl:pb-44">
          <h1>
            <span className="sr-only">Your wishlist. Their way to make it happen.</span>
            <span aria-hidden="true" className="block font-condensed text-[clamp(3.25rem,8vw,6.25rem)] leading-[0.95] tracking-wide uppercase">
              <Typed auto text="Your " at={0.5} />
              <span className="relative inline-block">
                <Typed auto text="Wish" start={5} at={0.5} />
                <Scribble delay={1.6} className="pointer-events-none absolute -inset-x-[12%] -inset-y-[20%] h-[140%] w-[124%] text-gold" />
              </span>
              <Typed auto text="list." start={9} at={0.5} />
            </span>
            <span aria-hidden="true" className="reveal-item mt-3 block font-display text-[clamp(1.75rem,3.4vw,2.6rem)] leading-tight italic" style={delay(1.4)}>
              Their way to <span className="text-gold">make it happen.</span>
            </span>
          </h1>
          <p className="reveal-item mt-6 max-w-xl text-lg leading-relaxed text-paper/70" style={delay(1.6)}>
            Create a gift registry for life&apos;s biggest moments. Let your friends and family buy a gift outright, chip
            in together for something special, or send you a gift of their choice.
          </p>
          <div className="reveal-item" style={delay(1.8)}>
            <HeroActions />
          </div>
        </div>
      </div>

      {/* Below xl there's no room around the copy, so the wishes scroll past instead. */}
      <div className="reveal-item relative pb-14 xl:hidden" style={delay(1.9)} aria-hidden="true">
        <div className="flex w-max animate-marquee gap-5 px-2.5 py-4">
          {[...wishes, ...wishes].map((w, i) => (
            <div key={i} style={{ rotate: `${i % 2 ? 3 : -3}deg` }}>
              <WishCard wish={w} delay={(i % wishes.length) * 0.1} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Constellation() {
  return (
    <div className="absolute inset-0 hidden xl:block" aria-hidden="true">
      <svg className="reveal-item reveal-fade absolute inset-0 h-full w-full" style={delay(1.2)} viewBox="0 0 100 100" preserveAspectRatio="none">
        {edges.map(([a, b]) => (
          <line key={a + b} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
            stroke="white" strokeOpacity="0.16" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {wishes.map((w, i) => (
        <div key={w.name} className="absolute" style={{ left: `${spots[i].left}%`, top: `${spots[i].top}%` }}>
          <div className="reveal-item reveal-drop" style={delay(0.1 + i * 0.14)}>
            <div className="animate-float" style={{ animationDelay: `${i * -1.2}s` }}>
              <div style={{ rotate: `${spots[i].rotate}deg` }}><WishCard wish={w} delay={0.9 + i * 0.14} /></div>
            </div>
          </div>
        </div>
      ))}

      <Chip at={nodes.tl} delay={1.9}><Avatar initials="TO" className="bg-gold text-night" /> +25 USDC from Tolu</Chip>
      <Chip at={nodes.tr} delay={2.05} className="border-gold/40 bg-gold/15 text-gold">Cash gift · 50 USDC</Chip>
      <Chip at={nodes.bl} delay={2.2}>
        <span className="flex -space-x-1.5">
          <Avatar initials="AO" className="bg-gold text-night" />
          <Avatar initials="KE" className="bg-stone text-night" />
          <Avatar initials="JM" className="bg-paper text-ink" />
        </span>
        12 friends chipped in
      </Chip>
      <Chip at={nodes.br} delay={2.35} className="border-gold/40 bg-gold/15 text-gold">✓ Fully funded</Chip>

      <div className="reveal-item reveal-fade" style={delay(2.2)}>
        <Asterisk className="absolute top-[3%] left-[19%] h-7 w-7 text-paper/80" />
        <Squiggle className="absolute top-[94%] left-[80%] h-6 w-16 text-paper/70" />
        <span className="absolute top-[27%] left-[27%] h-2 w-2 rounded-full bg-paper/70" />
        <span className="absolute top-[62%] left-[73%] h-2 w-2 rounded-full bg-gold" />
      </div>
    </div>
  );
}

function Chip({ at, delay: wait, className = "border-white/15 bg-night-soft text-paper/85", children }: {
  at: readonly [number, number]; delay: number; className?: string; children: React.ReactNode;
}) {
  // The outer span centres the chip on its node; the inner one pops in (separate elements,
  // since both use `translate`/`scale`).
  return (
    <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${at[0]}%`, top: `${at[1]}%` }}>
      <span
        className={`reveal-item reveal-pop flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${className}`}
        style={delay(wait)}
      >
        {children}
      </span>
    </span>
  );
}

function Avatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold ring-2 ring-night-soft ${className}`}>
      {initials}
    </span>
  );
}
