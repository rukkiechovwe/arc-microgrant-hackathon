import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Header } from "@/components/Header";
import { Providers } from "./providers";
import "./globals.css";

const body = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gift Registry on Arc",
  description: "Create a gift registry for any celebration. Friends and family chip in with USDC toward the gifts you want.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-line py-8 text-center text-xs text-muted">
            Gifts are sent in USDC on the Arc network. Amounts shown are read live from the blockchain.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
