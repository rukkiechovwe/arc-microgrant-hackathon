import Link from "next/link";
import { OpenRegistryForm } from "@/components/OpenRegistryForm";
import { OCCASIONS } from "@/lib/metadata";

const steps = [
  {
    title: "Create your registry",
    body: "Add the gifts you'd love, from a new fridge to a honeymoon fund, each with a target amount in USDC.",
  },
  {
    title: "Share one link",
    body: "Send your registry link to friends and family on WhatsApp, Instagram, or anywhere else.",
  },
  {
    title: "Everyone chips in",
    body: "Guests contribute any amount to a gift or send a general cash gift. Big gifts get funded together.",
  },
  {
    title: "Withdraw anytime",
    body: "Only you can withdraw what's been given. Funds go straight to your wallet. No middleman holds them.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <section className="py-16 text-center sm:py-24">
        <p className="mb-5 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-dark uppercase">
          Group gifting for life&apos;s big moments
        </p>
        <h1 className="mx-auto max-w-3xl font-display text-4xl leading-[1.1] font-semibold tracking-tight sm:text-6xl">
          The gifts you actually want, funded together.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Create a registry for your wedding, birthday, graduation or new home. Friends and family contribute any amount
          toward each gift, so nobody has to buy the whole fridge alone.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/create" className="btn-primary px-7 py-3 text-base">
            Create a registry
          </Link>
          <a href="#open" className="btn-secondary px-7 py-3 text-base">
            I have a registry link
          </a>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {Object.values(OCCASIONS).map((o) => (
            <span key={o} className="rounded-full border border-line bg-card px-3 py-1 text-sm text-muted">
              {o === "Celebration" ? "…and more" : o}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="card p-6">
            <span className="font-display text-3xl text-accent">{i + 1}</span>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 pb-16 md:grid-cols-2">
        <div className="card p-7">
          <h2 className="font-display text-2xl font-semibold">How the money works</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <li>
              <strong className="text-ink">Gifts are sent in USDC</strong>, a digital dollar (1 USDC ≈ US$1), on the
              Arc network. Guests need a wallet with USDC.
            </li>
            <li>
              <strong className="text-ink">Every contribution is recorded on the blockchain</strong>, so progress bars
              show real, verifiable totals, not numbers someone typed in.
            </li>
            <li>
              <strong className="text-ink">Naira amounts are a guide only.</strong> If a registry shows naira, it uses
              the owner&apos;s own exchange rate. This app doesn&apos;t convert money to naira or deliver physical
              gifts.
            </li>
          </ul>
        </div>
        <div id="open" className="card scroll-mt-24 p-7">
          <h2 className="font-display text-2xl font-semibold">Open a registry</h2>
          <p className="mt-2 text-sm text-muted">Paste the link you were sent, or the registry number.</p>
          <OpenRegistryForm />
        </div>
      </section>
    </div>
  );
}
