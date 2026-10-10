import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Header } from "@/components/Chrome";
import { img, menu, site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Menu — Kingston 10 | Jamaican & Caribbean Food in Adliya" },
  description:
    "The Kingston 10 menu: jerk chicken, curry goat, oxtail and bean, escovitch fish, rice and peas, plantains and Jamaican rum punch. Block 338, Adliya, Bahrain.",
  alternates: { canonical: "/menu" },
};

const splash = (style: CSSProperties) => style;

export default function MenuPage() {
  return (
    <>
      <Header current="menu" />

      <main id="main">
        <section className="page-hero">
          <span className="splash -one" style={splash({ width: "30vw", aspectRatio: "1", left: "-10vw", top: "-8vw", background: "var(--green-500)", opacity: 0.35 })}></span>
          <span className="splash -two" style={splash({ width: "22vw", aspectRatio: "1", right: "-6vw", bottom: "2vw", background: "var(--gold-500)", opacity: 0.18 })}></span>
          <div className="wrap">
            <p className="eyebrow -both">The menu</p>
            <h1 className="display h-xl">
              Taste the <em>Caribbean.</em>
            </h1>
            <p>Every dish is made from scratch using authentic techniques and ingredients. Prices in Bahraini dinar.</p>
          </div>
          <svg className="wave" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true">
            <path fill="#fbf1dc" d="M0 96c120-46 250-70 392-52 170 22 250 92 420 86 150-6 216-84 372-92 108-6 190 18 256 44v68H0z" />
          </svg>
        </section>

        <nav className="tabs" aria-label="Menu sections">
          <ul className="wrap">
            {menu.map((course) => (
              <li key={course.id}>
                <a href={`#${course.id}`}>{course.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="wrap">
          {menu.map((course, i) => (
            <section className="course" id={course.id} key={course.id} style={i === menu.length - 1 ? { borderBottom: 0 } : undefined}>
              <div className="course__head">
                <p className="eyebrow">{course.eyebrow}</p>
                <h2 className="display h-lg">{course.title}</h2>
              </div>
              <ul>
                {course.dishes.map((dish) => (
                  <li className="dish" key={dish.name}>
                    {dish.image ? (
                      <div className="dish__img">
                        <img src={img(dish.image)} alt="" loading="lazy" width={500} height={500} />
                      </div>
                    ) : (
                      <div className="dish__img -none" aria-hidden="true">
                        {dish.name[0]}
                      </div>
                    )}
                    <div>
                      <h3>{dish.name}</h3>
                      <p>{dish.desc}</p>
                    </div>
                    <span className="dish__price">
                      <small>BD</small>
                      {dish.price}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="section cta-band -gold">
          <div className="wrap">
            <h2 className="display h-lg">
              Hungry <em>yet?</em>
            </h2>
            <p>Book a table, or ask us about private dining and catering.</p>
            <div className="hero__actions" style={{ marginTop: 0, justifyContent: "center" }}>
              <a className="btn -ink" href="/#reserve">Book a table</a>
              <a className="btn -ghost" href={site.phoneHref}>{site.phone}</a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
