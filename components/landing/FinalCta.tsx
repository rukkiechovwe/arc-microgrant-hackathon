import Link from "next/link";
import { BurstSticker, GiftSticker } from "../Doodles";
import { Reveal } from "../Reveal";
import { delay } from "./motion";
import { Typed } from "./Typed";

export function FinalCta() {
  return (
    <Reveal as="section" className="relative overflow-hidden bg-paper py-24 sm:py-32">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_50%,black_35%,transparent_72%)]"
        aria-hidden="true"
      />
      <GiftSticker
        className="reveal-item reveal-pop absolute top-[8%] right-[6%] w-20 rotate-12 sm:top-[14%] sm:right-[16%] sm:w-36"
        style={delay(1.2)}
      />
      <BurstSticker
        className="reveal-item reveal-pop absolute right-[4%] bottom-[8%] hidden w-28 -rotate-12 sm:block lg:right-[8%] lg:bottom-[14%]"
        style={delay(1.6)}
      />

      {/* Same container, heading scale and outline/solid pairing as the other sections. */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-condensed text-[clamp(2.5rem,11vw,9rem)] leading-[0.9] tracking-wide whitespace-nowrap uppercase">
          <span className="sr-only">What are you waiting for?</span>
          <span aria-hidden="true" className="block text-outline-ink-thick">
            <Typed text="What are you" step={0.06} />
          </span>
          <span aria-hidden="true" className="block">
            <Typed text="waiting for?" start={12} step={0.06} />
          </span>
        </h2>
        <div className="reveal-item" style={delay(1.5)}>
          <Link
            href="/create"
            className="group mt-10 inline-flex items-center gap-3 rounded-full bg-gold px-8 py-4 text-lg font-semibold text-ink transition-[rotate,background-color] duration-300 hover:-rotate-3 hover:bg-stone"
          >
            Make a wish now
            <svg viewBox="0 0 48 24" className="h-5 w-11 transition-transform duration-300 group-hover:translate-x-1.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 13c12-2 26-1 40-1M33 3c4 4 7 7 10 9-4 3-7 6-10 10" />
            </svg>
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
