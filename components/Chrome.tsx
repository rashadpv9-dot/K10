import { LOGO, site, ticker } from "@/lib/site";

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const Arrows = { Left: ChevronLeft, Right: ChevronRight };

export function Ticker() {
  // The group is rendered twice so the CSS marquee loops seamlessly.
  const group = (hidden?: boolean) => (
    <div className="ticker__group" aria-hidden={hidden || undefined}>
      {ticker.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
  return (
    <div className="ticker" aria-label="This week at Kingston 10">
      <div className="ticker__track">
        {group()}
        {group(true)}
      </div>
    </div>
  );
}

export function Header({ current }: { current?: "menu" }) {
  return (
    <>
      <header className="header">
        <div className="wrap header__inner">
          <nav className="header__links" aria-label="Primary">
            <a className="header__link" href="/menu" aria-current={current === "menu" ? "page" : undefined}>
              Menu
            </a>
            <a className="header__link" href="/#events">Events</a>
            <a className="header__link" href="/#private">Private dining</a>
          </nav>
          <a className="header__logo" href="/" aria-label="Kingston 10 — home">
            <img src={LOGO} alt="Kingston 10" width={88} height={88} />
          </a>
          <nav className="header__links -end" aria-label="Secondary">
            <a className="header__link" href="/#story">Our story</a>
            <a className="header__link" href="/#visit">Visit</a>
            <a className="btn -solid" href="/#reserve">Book a table</a>
          </nav>
          <button className="burger" aria-label="Menu" aria-expanded="false" aria-controls="drawer">
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      <div className="drawer" id="drawer" data-lenis-prevent>
        <a href="/menu">Menu</a>
        <a href="/#events">Events</a>
        <a href="/#private">Private dining</a>
        <a href="/#story">Our story</a>
        <a href="/#visit">Visit</a>
        <a className="btn -solid" href="/#reserve">Book a table</a>
        <a className="btn -ghost" href={site.phoneHref}>Call {site.phone}</a>
      </div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span className="splash"></span>
      <div className="wrap footer__grid">
        <div className="hours" data-hours>
          <div className="hours__head">
            <button className="round-btn" data-hours-prev aria-label="Previous day">
              <ChevronLeft />
            </button>
            <div aria-live="polite">
              <small>Hours</small>
              <span className="display h-md" data-hours-day>Today</span>
            </div>
            <button className="round-btn" data-hours-next aria-label="Next day">
              <ChevronRight />
            </button>
          </div>
          <dl className="hours__rows">
            <div>
              <dt>Dining room</dt>
              <dd>{site.hours}</dd>
            </div>
            <div>
              <dt data-hours-night>Island vibes</dt>
              <dd data-hours-when>All day</dd>
            </div>
            <div>
              <dt>Reservations</dt>
              <dd>{site.phone}</dd>
            </div>
          </dl>
          <p className="hours__state" data-hours-state>
            <i></i>
            <span>Open daily</span>
          </p>
        </div>

        <div>
          <div className="footer__info">
            <div>
              <small>Address</small>
              <a href={site.maps} target="_blank" rel="noopener">
                {site.addressLine}, {site.city}
              </a>
            </div>
            <div>
              <small>Phone</small>
              <a href={site.phoneHref}>{site.phone}</a>
            </div>
            <div>
              <small>Email</small>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
          </div>
          <div className="footer__lower">
            <nav className="footer__nav" aria-label="Footer">
              <a href="/">Home</a>
              <a href="/menu">Menu</a>
              <a href="/#events">Events</a>
              <a href="/#private">Private dining</a>
              <a href="/#story">Our story</a>
            </nav>
            <div className="footer__social">
              <a className="round-btn" href={site.instagram} target="_blank" rel="noopener" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </a>
              <a className="round-btn" href={site.facebook} target="_blank" rel="noopener" aria-label="Facebook">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.7V21z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className="wrap footer__base">
        <span>© {new Date().getFullYear()} Kingston 10. All rights reserved.</span>
        <span>Authentic Caribbean cuisine · Adliya, Bahrain</span>
      </div>
    </footer>
  );
}
