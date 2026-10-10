import { Footer, Ticker } from "@/components/Chrome";
import { SiteMotion } from "@/components/SiteMotion";

// Chrome and motion for the public website. The admin area has its own layout.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Ticker />
      {children}
      <Footer />
      <SiteMotion />
    </>
  );
}
