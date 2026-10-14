import type { Metadata } from "next";
import { Anton, DM_Sans, Fraunces } from "next/font/google";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Providers } from "./providers";
import "./globals.css";

const body = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const condensed = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Your Wish",
  description: "Create a gift registry for life's biggest moments. Friends and family buy a gift outright, chip in together, or send a gift of their choice, in USDC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${condensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
