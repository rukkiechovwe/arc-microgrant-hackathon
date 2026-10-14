import { Reveal } from "../Reveal";
import { delay } from "./motion";
import { Typed } from "./Typed";

const steps = [
  {
    title: "Create your registry",
    body: "Add the gifts you'd love, from a new fridge to a honeymoon fund, each with a target amount in USDC.",
    icon: ListIcon,
  },
  {
    title: "Share one link",
    body: "Send your registry link to friends and family on WhatsApp, Instagram, or anywhere else.",
    icon: LinkIcon,
  },
  {
    title: "Everyone chips in",
    body: "Guests buy a gift outright, chip in any amount together, or send a cash gift of their choice.",
    icon: PeopleIcon,
  },
  {
    title: "Withdraw anytime",
    body: "Only you can withdraw what's been given. Funds go straight to your wallet. No middleman holds them.",
    icon: WalletIcon,
  },
];

const phrase = ["Make a wish", "Share your wish", "Watch your wish come true"];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-4 overflow-hidden bg-stone py-24 sm:py-32"
    >
      {/* The band crosses just below the middle of the heading. Same container and heading scale as the occasions section. */}
      <div className="relative py-8 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 flex translate-y-14 items-center sm:translate-y-38"
          aria-hidden="true"
        >
          <Band />
        </div>
        <Reveal className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="font-condensed text-[clamp(2.5rem,11vw,9rem)] leading-[0.9] tracking-wide whitespace-nowrap uppercase">
            <span className="sr-only">How it works</span>
            <span aria-hidden="true">
              <span className="text-outline-ink-thick">
                <Typed text="How it" />
              </span>
              <Typed text=" works" start={6} />
            </span>
          </h2>
        </Reveal>
      </div>

      <Reveal className="mt-10 sm:mt-12">
        <ol className="relative mx-auto grid max-w-7xl gap-5 px-4 sm:grid-cols-2 sm:gap-6 sm:px-6">
          {steps.map(({ title, body, icon: Icon }, i) => (
            <li
              key={title}
              className="reveal-item rounded-[1.75rem] bg-white p-7 shadow-[0_20px_40px_-24px_rgba(42,34,29,0.35)]"
              style={delay(0.15 + i * 0.12)}
            >
              <div className="flex items-start justify-between">
                <Icon />
                <span className="font-condensed text-lg text-muted/60">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-8 text-lg font-bold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/75">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

/** A full-bleed strip tilted corner to corner, with the slogan scrolling along it. */
function Band() {
  const items = [...phrase, ...phrase];
  return (
    <div className="absolute left-[-15%] w-[130%] -rotate-[10deg] bg-gold py-3 sm:-rotate-[8deg] sm:py-4">
      <div className="flex w-max animate-marquee">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex shrink-0">
            {items.map((p, i) => (
              <span
                key={i}
                // Strictly alternating outline / solid. Each copy holds an even number of phrases so the pattern survives the loop.
                className={`font-condensed text-4xl tracking-wide whitespace-nowrap uppercase sm:text-6xl ${i % 2 ? "text-ink" : "text-outline-ink"}`}
              >
                {p}
                <span className="px-5 text-ink sm:px-8">·</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

// Duotone step icons: ink outline over a brand-colour fill, like hand-cut stickers.
function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-12 w-12"
      aria-hidden="true"
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ListIcon() {
  return (
    <IconFrame>
      <rect
        x="9"
        y="6"
        width="27"
        height="35"
        rx="5"
        fill="var(--color-accent-soft)"
      />
      <path d="M16 16h13M16 23h13M16 30h7" />
      <path
        d="M36 27c.4 3.4 1.8 5.4 6 6.2-4.2.8-5.6 2.8-6 6.2-.4-3.4-1.8-5.4-6-6.2 4.2-.8 5.6-2.8 6-6.2Z"
        fill="var(--color-accent)"
      />
    </IconFrame>
  );
}

function LinkIcon() {
  return (
    <IconFrame>
      <rect
        x="5"
        y="17"
        width="22"
        height="14"
        rx="7"
        fill="var(--color-gold)"
        transform="rotate(-30 16 24)"
      />
      <rect
        x="21"
        y="17"
        width="22"
        height="14"
        rx="7"
        fill="var(--color-stone)"
        transform="rotate(-30 32 24)"
      />
      <path d="M19 29l10-10" />
    </IconFrame>
  );
}

function PeopleIcon() {
  return (
    <IconFrame>
      <circle cx="17" cy="16" r="6" fill="var(--color-sage-soft)" />
      <circle cx="32" cy="16" r="6" fill="var(--color-sage)" />
      <path
        d="M6 38c0-7 5-11 11-11s11 4 11 11Z"
        fill="var(--color-sage-soft)"
      />
      <path d="M21 38c0-7 5-11 11-11s11 4 11 11Z" fill="var(--color-sage)" />
    </IconFrame>
  );
}

function WalletIcon() {
  return (
    <IconFrame>
      <path d="M8 14c0-3 2-5 5-5h20l2 5" fill="var(--color-accent-soft)" />
      <rect
        x="6"
        y="14"
        width="34"
        height="26"
        rx="5"
        fill="var(--color-accent)"
      />
      <path d="M32 23h10v8H32a4 4 0 0 1 0-8Z" fill="var(--color-paper)" />
      <circle cx="33" cy="27" r="1" fill="var(--color-ink)" />
    </IconFrame>
  );
}
