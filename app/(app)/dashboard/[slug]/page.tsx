import type { Metadata } from "next";
import { Suspense } from "react";
import { RegistryDetailRoute } from "@/components/Dashboard";

export const metadata: Metadata = { title: "Registry · Your Wish" };

// The slug is read on the client (useParams) inside Suspense, so the page shell still prerenders
// under cacheComponents. Awaiting `params` here would make the whole route wait for the request.
export default function RegistryDetailPage() {
  return (
    <Suspense>
      <RegistryDetailRoute />
    </Suspense>
  );
}
