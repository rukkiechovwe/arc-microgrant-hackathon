import { Suspense } from "react";
import { RegistryView } from "@/components/RegistryView";

export default function RegistryPage() {
  return (
    <Suspense fallback={<RegistrySkeleton />}>
      <RegistryView />
    </Suspense>
  );
}

function RegistrySkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-12 sm:px-6">
      <div className="h-5 w-24 rounded-full bg-line" />
      <div className="mt-4 h-10 w-2/3 rounded-xl bg-line" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-3xl bg-line/60" />)}
      </div>
    </div>
  );
}
