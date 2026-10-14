import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Occasions } from "@/components/landing/Occasions";

export default function Home() {
  return (
    <>
      <Hero />
      <Occasions />
      <HowItWorks />
      <FinalCta />
    </>
  );
}
