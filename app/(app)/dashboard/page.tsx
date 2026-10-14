import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardOverview } from "@/components/Dashboard";

export const metadata: Metadata = { title: "Dashboard · Your Wish" };

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardOverview />
    </Suspense>
  );
}
