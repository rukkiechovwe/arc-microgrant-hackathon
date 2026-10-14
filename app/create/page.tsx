import type { Metadata } from "next";
import { CreateRegistryForm } from "@/components/CreateRegistryForm";

export const metadata: Metadata = { title: "Create a registry · Your Wish" };

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Create your registry</h1>
      <p className="mt-2 text-muted">
        Tell guests what you&apos;re celebrating and add the gifts you&apos;d love. You can include a general cash fund
        too. It&apos;s always available, even with no gifts listed.
      </p>
      <CreateRegistryForm />
    </div>
  );
}
