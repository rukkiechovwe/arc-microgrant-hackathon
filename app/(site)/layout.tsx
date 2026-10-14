import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

// Public pages (create, guest registry view): light header and the big footer.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header tone="light" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
