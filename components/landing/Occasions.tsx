import Image from "next/image";
import { WishStar } from "../Doodles";
import { Reveal } from "../Reveal";
import { delay } from "./motion";
import { Typed } from "./Typed";

// Photos from Pexels, free to use: https://www.pexels.com/license/
const occasions = [
  { label: "Weddings", image: "/landing/wedding.jpg", rotate: -4 },
  { label: "Birthdays", image: "/landing/birthday.jpg", rotate: 3 },
  { label: "Baby Showers", image: "/landing/baby-shower.jpg", rotate: -2 },
  { label: "Housewarmings", image: "/landing/housewarming.jpg", rotate: 4 },
  { label: "Anniversaries", image: "/landing/anniversary.jpg", rotate: -3 },
  { label: "Graduations", image: "/landing/graduation.jpg", rotate: 2 },
  { label: "And more", image: null, rotate: -2 },
];

export function Occasions() {
  return (
    <section
      id="occasions"
      className="scroll-mt-4 bg-night pt-6 pb-24 text-paper sm:pt-10 sm:pb-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="border-t border-white/10 pt-16">
          {/* Always exactly two lines: the size is capped so "EVERY OCCASION" never wraps. */}
          <h2 className="font-condensed text-[clamp(2.5rem,11vw,9rem)] leading-[0.9] tracking-wide whitespace-nowrap uppercase">
            <span className="sr-only">A wish for every occasion</span>
            <span aria-hidden="true" className="block text-outline">
              <Typed text="A wish for" step={0.06} />
            </span>
            <span aria-hidden="true" className="block">
              <Typed text="every occasion" start={10} step={0.06} />
            </span>
          </h2>
          <p
            className="reveal-item mt-8 max-w-xl text-lg leading-relaxed text-paper/70"
            style={delay(1.5)}
          >
            Life gives us a thousand reasons to celebrate. Create a registry
            filled with the things you love and let your favourite people help
            make your wishes come true, one gift at a time.
          </p>
        </Reveal>
      </div>

      <Reveal>
        <ul className="scrollbar-none mx-auto mt-16 flex max-w-7xl snap-x snap-mandatory gap-8 overflow-x-auto px-6 pt-4 pb-16 lg:flex-wrap lg:justify-center lg:gap-x-14 lg:gap-y-24 lg:overflow-visible">
          {occasions.map((o, i) => (
            <li
              key={o.label}
              className="group w-[15rem] shrink-0 snap-center sm:w-[17rem] lg:w-[16rem]"
            >
              {/* Drops in, then shakes as it lands. Kept on its own element so the hover lift still works. */}
              <div
                className="reveal-item reveal-drop-shake"
                style={delay(i * 0.12)}
              >
                <div
                  className="relative transition-transform duration-500 ease-out group-hover:-translate-y-2 group-hover:rotate-0!"
                  style={{ rotate: `${o.rotate}deg` }}
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-night-soft shadow-[0_30px_60px_-20px_rgba(20,14,12,0.7)]">
                    {o.image ? (
                      <>
                        <Image
                          src={o.image}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 272px, 240px"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-night/60 to-transparent" />
                      </>
                    ) : (
                      <div className="flex h-full flex-col justify-between bg-gold p-6 pb-14">
                        <WishStar className="h-14 w-14 text-night" />
                        <p className="text-lg leading-snug font-medium text-night/85">
                          Engagements, naming ceremonies, send-offs, or just
                          because.
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="absolute -bottom-7 left-1/2 -translate-x-1/2 font-condensed text-[clamp(1.9rem,2.6vw,2.4rem)] leading-none whitespace-nowrap text-paper uppercase drop-shadow-[0_4px_12px_rgba(48,35,31,0.8)]">
                    {o.label}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
