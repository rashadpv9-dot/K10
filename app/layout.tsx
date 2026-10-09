import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Footer, Ticker } from "@/components/Chrome";
import { SiteMotion } from "@/components/SiteMotion";
import { LOGO, site } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Kingston 10 — Authentic Caribbean Cuisine in Adliya, Bahrain",
    template: "%s — Kingston 10",
  },
  description:
    "Bahrain's first authentic Caribbean restaurant. Jerk chicken, curry goat, oxtail, reggae brunches and live DJs at Block 338, Adliya. Open daily 12 PM – 2 AM.",
  icons: { icon: LOGO },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: "Kingston 10 — Authentic Caribbean Cuisine in Adliya",
    description: "Island fire, Bahraini heart. Jerk, curry goat, oxtail and reggae nights at Block 338, Adliya.",
    images: ["https://kingston10bh.com/wp-content/uploads/2026/05/Hero2.png"],
  },
};

export const viewport: Viewport = { themeColor: "#0f4a30" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // "no-js" is removed by the inline script before paint; without JS the page stays fully visible.
    <html lang="en" className={`${fraunces.variable} ${outfit.variable} no-js`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('no-js')" }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Ticker />
        {children}
        <Footer />
        <SiteMotion />
      </body>
    </html>
  );
}
