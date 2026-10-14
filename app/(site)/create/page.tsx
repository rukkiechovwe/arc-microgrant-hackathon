import type { Metadata } from "next";
import { CreateRegistryForm } from "@/components/CreateRegistryForm";

export const metadata: Metadata = { title: "Create a registry · Your Wish" };

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">New registry</p>
      <h1 className="heading-page mt-3">
        <span className="text-outline-ink-thick">Make a</span> wish
      </h1>
      <p className="mt-4 max-w-xl text-muted">
        Tell guests what you&apos;re celebrating, add the gifts you&apos;d love, and share one link. It takes a couple of
        minutes.
      </p>
      <CreateRegistryForm />
    </div>
  );
}
