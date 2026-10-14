import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

// Landing page: dark header over the dark hero, plus the big footer.
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header tone="dark" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
