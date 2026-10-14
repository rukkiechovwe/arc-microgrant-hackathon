import { Header } from "@/components/Header";

// The dashboard is a workspace: light header, no landing-page footer.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header tone="light" />
      <main className="flex-1">{children}</main>
    </>
  );
}
