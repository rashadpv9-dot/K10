import type { CSSProperties } from "react";
import { Arrows, Header } from "@/components/Chrome";
import { img, nights, plates, site } from "@/lib/site";

// Stagger delay for .reveal elements (used by the no-GSAP CSS fallback).
const delay = (s: string) => ({ "--d": s }) as CSSProperties;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: site.name,
  servesCuisine: ["Caribbean", "Jamaican"],
  url: `${site.url}/`,
  telephone: "+97334373567",
  email: site.email,
  image: img("Hero2.png"),
  priceRange: "BD 2 – BD 14",
  address: { "@type": "PostalAddress", streetAddress: site.addressLine, addressLocality: site.city, addressCountry: "BH" },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "12:00",
    closes: "02:00",
  },
  menu: `${site.url}/menu`,
  acceptsReservations: "True",
  sameAs: [site.instagram, site.facebook],
};

const times = ["12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM", "11:00 PM", "12:00 AM"];
const guests = ["1", "2", "3", "4", "5", "6", "7", "8", "9+"];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />

      <main id="main">
        {/* Hero */}
        <section className="hero">
          <span className="splash -one"></span>
          <span className="splash -two"></span>
          <div className="wrap hero__grid">
            <div>
              <h1 className="display h-xl hero__title">
                <span>Island fire,</span>
                <span className="-shift">
                  <em>Bahraini</em>
                </span>
                <span>heart.</span>
              </h1>
              <div className="hero__copy">
                <h2 className="eyebrow">Authentic Caribbean cuisine · Adliya</h2>
                <p>
                  Welcome to Kingston 10, your gateway to the vibrant tastes, rhythms and culture of the Caribbean — right here in
                  Adliya.
                </p>
                <div className="hero__actions">
                  <a className="btn -solid" href="#reserve">Book a table</a>
                  <a className="btn -ghost" href="/menu">See the menu</a>
                </div>
              </div>
            </div>
            <div className="hero__art">
              <div className="hero__blob">
                <img src={img("Hero2.png")} alt="Skewers and sausages over the Kingston 10 grill" width={1980} height={1080} fetchPriority="high" />
              </div>
              <img className="hero__bowl" src={img("h1.png")} alt="A clay bowl of spiced rice and chicken" width={699} height={664} />
              <svg className="hero__stamp" viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <path id="stamp" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" />
                </defs>
                <text>
                  <textPath href="#stamp">Bahrain's first · authentic Caribbean ·</textPath>
                </text>
                <circle cx="60" cy="60" r="26" fill="#f6b21a" />
                <text x="60" y="67" textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: 0, fill: "#15110d" }}>
                  K10
                </text>
              </svg>
            </div>
          </div>
          <svg className="wave" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true">
            <path fill="#f6b21a" d="M0 96c120-46 250-70 392-52 170 22 250 92 420 86 150-6 216-84 372-92 108-6 190 18 256 44v68H0z" />
          </svg>
        </section>

        {/* Quick actions */}
        <div className="-gold">
          <div className="wrap quick">
            <ul className="quick__list">
              <li>
                <a href="#reserve">
                  <small>Reserve</small>
                  <strong>Book a table</strong>
                </a>
              </li>
              <li>
                <a href={site.phoneHref}>
                  <small>Call us</small>
                  <strong>{site.phone}</strong>
                </a>
              </li>
              <li>
                <a href="#visit">
                  <small>Find us</small>
                  <strong>{site.addressLine}</strong>
                </a>
              </li>
              <li>
                <a href="#events">
                  <small>Open daily</small>
                  <strong>12 PM – 2 AM</strong>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Menu callout */}
        <section className="section callout -gold">
          <span className="splash -one"></span>
          <span className="splash -two"></span>
          <figure className="orbit -a reveal">
            <img src={img("Hero1.png")} alt="Trays of Caribbean dishes" loading="lazy" />
          </figure>
          <figure className="orbit -b reveal" style={delay(".1s")}>
            <img src={img("hero3.png")} alt="Seasoned rice in a clay bowl" loading="lazy" />
          </figure>
          <figure className="orbit -c reveal" style={delay(".2s")}>
            <img src={img("Curry-Goats.png")} alt="Curry goat" loading="lazy" />
          </figure>
          <figure className="orbit -d reveal" style={delay(".15s")}>
            <img src={img("hh22.png")} alt="Guests sharing a table at Kingston 10" loading="lazy" />
          </figure>
          <div className="wrap">
            <div className="callout__inner reveal">
              <p className="eyebrow -both">The menu</p>
              <h2 className="display h-lg">
                Bold flavours. Island classics. <em>Made to remember.</em>
              </h2>
              <p>
                Discover the rich and diverse flavours of Jamaica through our carefully curated menu. From street-food favourites to
                signature dishes, every plate is designed to deliver an authentic island experience.
              </p>
              <a className="btn -ink" href="/menu">View full menu</a>
            </div>
          </div>
        </section>

        {/* Signature plates */}
        <section className="section plates -ink" aria-labelledby="plates-title">
          <div className="plates__pin">
            <h2 className="sr-only" id="plates-title">Taste the Caribbean</h2>
            <svg className="plates__arc" viewBox="0 0 720 150" aria-hidden="true">
              <defs>
                <path id="arc" d="M20 140 Q360 -10 700 140" />
              </defs>
              <text textAnchor="middle">
                <textPath href="#arc" startOffset="50%">Taste the Caribbean</textPath>
              </text>
            </svg>
            <ul className="plates__rail" tabIndex={0} aria-label="Signature dishes">
              {plates.map((p) => (
                <li className="plate" data-bg={p.bg} key={p.name}>
                  <div className="plate__disc">
                    <img src={img(p.image)} alt={p.name} width={500} height={500} />
                    <span className="plate__price">
                      <small>BD</small>
                      {p.price}
                    </span>
                  </div>
                  <p className="plate__tag">{p.tag}</p>
                  <h3 className="display h-md">{p.name}</h3>
                  <p>{p.note}</p>
                </li>
              ))}
            </ul>
            <div className="plates__nav">
              <button className="round-btn" data-plates-prev aria-label="Previous dishes">
                <Arrows.Left />
              </button>
              <button className="round-btn" data-plates-next aria-label="Next dishes">
                <Arrows.Right />
              </button>
              <span className="plates__count" data-plates-count aria-hidden="true">
                01 / 0{plates.length}
              </span>
              <a className="btn -ghost" href="/menu">Full menu</a>
            </div>
            <div className="plates__bar" aria-hidden="true">
              <i data-plates-bar></i>
            </div>
          </div>
        </section>

        {/* Numbers */}
        <section className="section numbers on-cream">
          <div className="wrap numbers__grid">
            <div className="bubble b1 reveal">
              <b>1st</b>
              <span>Authentic Caribbean restaurant in Bahrain</span>
            </div>
            <div className="bubble -photo b2 reveal" style={delay(".1s")}>
              <img src={img("ffff.png")} alt="Guests laughing at Kingston 10" loading="lazy" />
            </div>
            <div className="bubble b3 reveal" style={delay(".15s")}>
              <b>
                <span data-count="24" style={{ fontSize: "inherit", margin: 0 }}>24</span>h
              </b>
              <span>Jerk marinade, every time</span>
            </div>
            <div className="bubble b4 reveal" style={delay(".2s")}>
              <b data-count="7">7</b>
              <span>Days a week</span>
            </div>
            <div className="bubble b5 reveal" style={delay(".25s")}>
              <b>2 AM</b>
              <span>Kitchen &amp; vibes go late</span>
            </div>
          </div>
        </section>

        {/* Events */}
        <section className="section on-cream" id="events" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="head reveal">
              <h2 className="display h-lg" style={{ color: "var(--red-600)" }}>Good vibes, every night.</h2>
              <p className="lede">
                Whether you want to feast at the legendary Reggae Brunch Fest or dance to live DJs, there is a night for everyone — the
                heart of the Caribbean, right here in Adliya.
              </p>
            </div>
            <ul className="nights">
              {nights.map((n, i) => (
                <li className="night reveal" style={delay(`${i * 0.08}s`)} key={n.title}>
                  <div className="night__top">
                    {n.soon && <span className="badge">Coming soon</span>}
                    <h3 className="display h-sm">{n.title}</h3>
                    <small>{n.kind}</small>
                  </div>
                  <div className="night__img">
                    <img src={img(n.image)} alt={n.alt} loading="lazy" />
                  </div>
                  <dl className="night__meta">
                    <div>
                      <dt>Day</dt>
                      <dd>{n.day}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{n.time}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <ul className="chips reveal" style={{ color: "var(--red-600)" }}>
              <li>Also on rotation</li>
              <li>Comedy Night</li>
              <li>Karaoke</li>
              <li>Ladies' Night</li>
            </ul>
          </div>
        </section>

        {/* Private dining / catering */}
        <section className="section private -red" id="private">
          <span className="splash"></span>
          <div className="wrap private__grid">
            <div className="private__body reveal">
              <p className="eyebrow">Private dining &amp; catering</p>
              <h2 className="display h-lg">
                Celebrate it <em>island-style.</em>
              </h2>
              <p>
                Birthdays, team nights or the whole family around one table — we'll bring the food, the music and the energy. Planning
                something off-site? Ask us about catering.
              </p>
              <ul className="private__list">
                <li>Private dining</li>
                <li>Catering</li>
                <li>Birthdays</li>
                <li>Live music</li>
              </ul>
              <a className="btn -solid" href={`mailto:${site.email}?subject=Private%20event%20enquiry`}>Plan your event</a>
            </div>
            <figure className="arch reveal" style={delay(".15s")}>
              <img src={img("cc.png")} alt="A lively crowd under the lights at Kingston 10" loading="lazy" width={599} height={881} />
            </figure>
          </div>
        </section>

        {/* Story */}
        <section className="section on-cream" id="story">
          <div className="wrap story__grid">
            <div className="story__art reveal">
              <figure className="-main">
                <img src={img("kingston-entr.webp")} alt="The entrance to Kingston 10" loading="lazy" width={382} height={510} />
              </figure>
              <figure className="-inset">
                <img src={img("hh22.png")} alt="Friends around a table at Kingston 10" loading="lazy" />
              </figure>
            </div>
            <div className="story__body reveal" style={delay(".1s")}>
              <p className="eyebrow">About Kingston 10</p>
              <h2 className="display h-lg">
                Caribbean soul. <em>Bahraini heart.</em>
              </h2>
              <p className="lede">
                We are Bahrain's first authentic Caribbean restaurant, bringing the spicy, smoky flavours of Jamaica to Block 338, Adliya.
              </p>
              <p>
                Our name comes from Kingston, Jamaica's vibrant capital. Our founder grew up surrounded by jerk chicken, reggae and open
                tables — and when we came to Bahrain, we missed that unapologetic Caribbean flavour. So we brought it ourselves.
              </p>
              <ul className="story__points">
                <li>
                  <b>From scratch</b>
                  <span>Traditional recipes passed down through generations. No shortcuts, no compromises.</span>
                </li>
                <li>
                  <b>Island spice</b>
                  <span>Spices imported straight from the islands, cooked with love and fire.</span>
                </li>
                <li>
                  <b>Like family</b>
                  <span>Great food, great music, great energy — and always a warm welcome.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Reserve + Visit */}
        <section className="reserve" id="reserve">
          <div className="reserve__pane -green">
            <p className="eyebrow">Reservations</p>
            <h2 className="display h-lg">
              Pull up a <em>chair.</em>
            </h2>
            <form className="form" data-reserve={site.email}>
              <div className="field">
                <label htmlFor="r-name">Name</label>
                <input id="r-name" name="name" autoComplete="name" required />
              </div>
              <div className="field">
                <label htmlFor="r-phone">Phone</label>
                <input id="r-phone" name="phone" type="tel" autoComplete="tel" required />
              </div>
              <div className="field">
                <label htmlFor="r-date">Date</label>
                <input id="r-date" name="date" type="date" required />
              </div>
              <div className="field">
                <label htmlFor="r-time">Time</label>
                <select id="r-time" name="time" defaultValue="7:00 PM" required>
                  {times.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field -full">
                <label htmlFor="r-guests">Guests</label>
                <select id="r-guests" name="guests" defaultValue="2">
                  {guests.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="field -full">
                <label htmlFor="r-notes">Anything we should know?</label>
                <textarea id="r-notes" name="notes" rows={3} data-lenis-prevent></textarea>
              </div>
              <button className="btn -solid" type="submit">Request a table</button>
              <a className="btn -ghost" href={site.phoneHref}>Or call us</a>
              <p className="form__note">Sending opens an email to our team — we'll confirm your table by phone.</p>
            </form>
          </div>
          <div className="reserve__pane -gold" id="visit">
            <p className="eyebrow">Visit us</p>
            <h2 className="display h-lg">
              Find the <em>island.</em>
            </h2>
            <ul className="visit">
              <li>
                <small>Address</small>
                <strong>
                  {site.addressLine}
                  <br />
                  {site.city}, {site.country}
                </strong>
              </li>
              <li>
                <small>Hours</small>
                <strong>Daily · {site.hours}</strong>
              </li>
              <li>
                <small>Phone</small>
                <strong>
                  <a href={site.phoneHref}>{site.phone}</a>
                </strong>
              </li>
              <li>
                <small>Email</small>
                <strong>
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </strong>
              </li>
            </ul>
            <div>
              <a className="btn -ink" href={site.maps} target="_blank" rel="noopener">Get directions</a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
