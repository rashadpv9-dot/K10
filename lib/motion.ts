// Site interactions and motion: GSAP + ScrollTrigger, with Lenis for smooth scrolling.
// initSite() wires everything to the rendered DOM and returns a cleanup function.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// Open daily 12:00 → 02:00 (next day). Edit here if hours change.
const OPEN_HOUR = 12;
const CLOSE_HOUR = 2;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NIGHTS: Record<number, [string, string]> = {
  0: ["Sunday Service", "Afro Grill & Music · 1 PM till late"],
  4: ["One Love Thursdays", "Live DJs"],
  5: ["Reggae Brunch Fest", "3 PM – 7 PM"],
  6: ["Games & Giggles", "6 PM till late · coming soon"],
};

const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => Array.from(el.querySelectorAll<T>(s));
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export function initSite(): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const root = document.documentElement;
  const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lenis: Lenis | null = null;
  let lenisTick: ((time: number) => void) | null = null;
  let ctx: gsap.Context | null = null;
  let tabsObserver: IntersectionObserver | null = null;
  // Set while the dishes section is pinned by ScrollTrigger.
  let pinned: { st: ScrollTrigger; state: { p: number } } | null = null;

  /* Sticky header state */
  const header = $(".header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-stuck", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true, signal });
    onScroll();
  }

  /* Mobile drawer */
  const burger = $(".burger");
  const drawer = $(".drawer");
  if (burger && drawer) {
    const setOpen = (open: boolean) => {
      burger.setAttribute("aria-expanded", String(open));
      drawer.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
      if (lenis) open ? lenis.stop() : lenis.start();
      if (open && motion) {
        gsap.fromTo(
          drawer.children,
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.06, delay: 0.2, overwrite: true }
        );
      }
    };
    burger.addEventListener("click", () => setOpen(burger.getAttribute("aria-expanded") !== "true"), { signal });
    drawer.addEventListener("click", (e) => (e.target as Element).closest("a") && setOpen(false), { signal });
    addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false), { signal });
  }

  /* Dish carousel buttons */
  const rail = $(".plates__rail");
  const plates = rail ? $$(".plate", rail) : [];
  if (rail && plates.length) {
    const go = (dir: number) => {
      if (pinned) {
        const { st, state } = pinned;
        const last = plates.length - 1;
        const i = clamp(Math.round(state.p * last) + dir, 0, last);
        const top = st.start + (i / last) * (st.end - st.start);
        if (lenis) lenis.scrollTo(top, { duration: 1.1 });
        else scrollTo({ top, behavior: "smooth" });
        return;
      }
      rail.scrollBy({ left: dir * (plates[0].getBoundingClientRect().width + 32), behavior: "smooth" });
    };
    $("[data-plates-prev]")?.addEventListener("click", () => go(-1), { signal });
    $("[data-plates-next]")?.addEventListener("click", () => go(1), { signal });
  }

  if (motion) ctx = gsap.context(initMotion);
  else $$(".reveal").forEach((el) => el.classList.add("is-in"));

  function initMotion() {
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: "power3.out", duration: 1 });
    root.classList.add("gsap-on");
    const mm = gsap.matchMedia();

    // Lenis eases wheel/keyboard scrolling and is driven by GSAP's ticker so that
    // ScrollTrigger and the smooth scroll stay on the same frame.
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    lenisTick = (time) => lenis?.raf(time * 1000);
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);

    // CSS smooth scrolling fights ScrollTrigger, so same-page links are scrolled here instead.
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as Element).closest<HTMLAnchorElement>("a[href*='#']");
        if (!link || link.pathname !== location.pathname || link.hash.length < 2) return;
        const target = $(link.hash);
        if (!target) return;
        e.preventDefault();
        lenis?.scrollTo(target, { duration: 1.4 });
        history.pushState(null, "", link.hash);
      },
      { signal }
    );

    /* ---- Hero: intro timeline, idle loops, scroll parallax ---- */
    if ($(".hero")) {
      gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .from(".header", { yPercent: -100, duration: 0.8, clearProps: "transform" })
        .from(".hero__title span", { yPercent: 70, opacity: 0, rotate: 4, transformOrigin: "0% 100%", duration: 1.1, stagger: 0.12 }, 0.1)
        .from(".hero__copy > *", { y: 30, opacity: 0, duration: 0.9, stagger: 0.1 }, 0.5)
        .from(".hero__blob", { scale: 0.5, opacity: 0, rotate: -20, duration: 1.4, ease: "expo.out" }, 0.2)
        .from(".hero__bowl", { xPercent: -60, yPercent: 40, opacity: 0, rotate: -30, duration: 1.3, ease: "back.out(1.4)" }, 0.6)
        .from(".hero__stamp", { scale: 0, opacity: 0, duration: 0.9, ease: "back.out(2)" }, 1)
        .from(".quick__list li", { y: 40, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.9)
        .add(() => {
          gsap.to(".hero__bowl", { y: -14, rotate: -2, duration: 3.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
        });

      gsap.to(".hero__stamp", { rotation: 360, duration: 26, ease: "none", repeat: -1 });

      const heroScrub = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
      gsap.to(".hero__art", { yPercent: -12, ease: "none", scrollTrigger: heroScrub });
      gsap.to(".hero__title", { yPercent: 18, ease: "none", scrollTrigger: heroScrub });
      gsap.to(".hero .splash.-one", { yPercent: -35, rotate: 25, ease: "none", scrollTrigger: heroScrub });
      gsap.to(".hero .splash.-two", { yPercent: -120, ease: "none", scrollTrigger: heroScrub });
    }

    /* ---- Menu page hero ---- */
    if ($(".page-hero")) {
      gsap.from(".page-hero .wrap > *", { y: 40, opacity: 0, duration: 1.1, stagger: 0.12, delay: 0.15 });
      gsap.to(".page-hero .splash", { yPercent: -40, ease: "none", scrollTrigger: { trigger: ".page-hero", start: "top top", end: "bottom top", scrub: true } });
    }

    /* ---- Menu intro: floating photos pop in, then drift at different speeds ---- */
    $$(".orbit").forEach((el, i) => {
      gsap.fromTo(
        el,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.1, ease: "back.out(1.6)", delay: i * 0.08, scrollTrigger: { trigger: ".callout", start: "top 75%", once: true } }
      );
      gsap.to(el, { yPercent: [-40, 30, -25, 45][i % 4], ease: "none", scrollTrigger: { trigger: ".callout", start: "top bottom", end: "bottom top", scrub: 1 } });
    });
    $$(".callout .splash").forEach((el, i) =>
      gsap.to(el, { rotate: i ? -70 : 70, scale: 1.25, ease: "none", scrollTrigger: { trigger: ".callout", start: "top bottom", end: "bottom top", scrub: 1 } })
    );

    /* ---- Signature dishes: pinned, scrubbed horizontal scroll (wide screens) ---- */
    const section = rail?.closest<HTMLElement>(".plates");
    const pin = section && $(".plates__pin", section);
    if (rail && section && pin && plates.length > 1) {
      const count = $("[data-plates-count]", section);
      const bar = $("[data-plates-bar]", section);
      const last = plates.length - 1;
      const discs = plates.map((p) => p.querySelector<HTMLElement>(".plate__disc img"));
      const colors = plates.map((p) => (p.dataset.bg || "#15110d").match(/\w\w/g)!.map((h) => parseInt(h, 16)));

      mm.add("(min-width: 901px) and (min-height: 620px)", () => {
        section.classList.add("is-pinned");
        const state = { p: 0 };
        let travel = 0;

        const layout = () => {
          const w = plates[0].offsetWidth;
          travel = (w + parseFloat(getComputedStyle(rail).columnGap)) * last;
          section.style.setProperty("--pad", `${(pin.clientWidth - w) / 2}px`);
        };

        const render = () => {
          const pos = state.p * last;
          gsap.set(rail, { x: -state.p * travel });

          const i = Math.min(Math.floor(pos), last - 1);
          const t = pos - i;
          const mix = colors[i].map((c, k) => Math.round(c + (colors[i + 1][k] - c) * t));
          section.style.backgroundColor = `rgb(${mix.join(" ")})`;

          plates.forEach((plate, n) => {
            const d = n - pos;
            gsap.set(plate, { scale: 1 - Math.min(Math.abs(d), 1) * 0.24, opacity: 1 - Math.min(Math.abs(d), 1.6) * 0.38 });
            gsap.set(discs[n], { rotation: d * 38 });
          });
          if (count) count.textContent = `0${Math.round(pos) + 1} / 0${plates.length}`;
          if (bar) gsap.set(bar, { scaleX: state.p });
        };

        layout();
        const tween = gsap.to(state, {
          p: 1,
          ease: "none",
          onUpdate: render,
          scrollTrigger: {
            trigger: section,
            start: "top top",
            // About one screen of scrolling per dish, so a fast flick can't skip the section.
            end: () => `+=${Math.max(travel * 1.3, last * innerHeight)}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            refreshPriority: 1,
            onRefreshInit: layout,
            onRefresh: render,
          },
        });
        render();
        pinned = { st: tween.scrollTrigger!, state };

        gsap.from(".plates__arc", { y: 60, opacity: 0, duration: 1.2, scrollTrigger: { trigger: section, start: "top 70%", once: true } });

        return () => {
          pinned = null;
          section.classList.remove("is-pinned");
          section.style.removeProperty("background-color");
          section.style.removeProperty("--pad");
          gsap.set([rail, bar, ...plates, ...discs], { clearProps: "all" });
        };
      });
    }

    /* ---- Numbers: bubbles spring in, figures count up ---- */
    if ($(".numbers")) {
      gsap.fromTo(
        ".numbers .bubble",
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.3, ease: "elastic.out(1, 0.7)", stagger: 0.12, scrollTrigger: { trigger: ".numbers", start: "top 70%", once: true } }
      );
    }
    $$("[data-count]").forEach((el) => {
      const n = { v: 0 };
      gsap.to(n, {
        v: Number(el.dataset.count),
        duration: 1.8,
        ease: "power2.out",
        snap: { v: 1 },
        onUpdate: () => {
          el.textContent = String(n.v);
        },
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      });
    });

    /* ---- Generic reveals, batched so neighbours stagger ---- */
    ScrollTrigger.batch(".reveal:not(.bubble):not(.orbit)", {
      start: "top 88%",
      once: true,
      onEnter: (els) => gsap.fromTo(els, { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.1, overwrite: true }),
    });

    /* ---- Image parallax inside masked frames ---- */
    $$(".arch img, .story__art .-main img").forEach((image) =>
      gsap.fromTo(
        image,
        { yPercent: -8, scale: 1.18 },
        { yPercent: 8, scale: 1.18, ease: "none", scrollTrigger: { trigger: image.parentElement, start: "top bottom", end: "bottom top", scrub: true } }
      )
    );
    $$(".private .splash, .footer .splash").forEach((el) =>
      gsap.to(el, { rotate: 60, scale: 1.2, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 1 } })
    );
    if ($(".story__art .-inset")) {
      gsap.to(".story__art .-inset", { yPercent: -30, ease: "none", scrollTrigger: { trigger: ".story__art", start: "top bottom", end: "bottom top", scrub: 1 } });
    }

    /* ---- Reserve / visit panes slide in from their own sides ---- */
    if ($(".reserve")) {
      const st = { trigger: ".reserve", start: "top 72%", once: true };
      gsap.from(".reserve__pane.-green > *", { x: -50, opacity: 0, stagger: 0.1, scrollTrigger: st });
      gsap.from(".reserve__pane.-gold > *", { x: 50, opacity: 0, stagger: 0.1, scrollTrigger: st });
    }

    /* ---- Menu page: dishes and headings ---- */
    if ($(".dish")) {
      gsap.set(".dish, .course__head > *", { opacity: 0 });
      ScrollTrigger.batch(".course__head > *", {
        start: "top 88%",
        once: true,
        onEnter: (els) => gsap.fromTo(els, { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.1, overwrite: true }),
      });
      ScrollTrigger.batch(".dish", {
        start: "top 92%",
        once: true,
        onEnter: (els) => gsap.fromTo(els, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, stagger: 0.07, overwrite: true }),
      });
    }
    if ($(".cta-band")) {
      gsap.from(".cta-band .wrap > *", { y: 40, opacity: 0, stagger: 0.12, scrollTrigger: { trigger: ".cta-band", start: "top 75%", once: true } });
    }

    /* ---- Footer ---- */
    gsap.from(".hours", { y: 60, opacity: 0, rotate: -3, duration: 1.1, scrollTrigger: { trigger: ".footer", start: "top 80%", once: true } });
    gsap.from(".footer__nav a", { x: -30, opacity: 0, stagger: 0.07, scrollTrigger: { trigger: ".footer__nav", start: "top 92%", once: true } });

    // Arriving with a #hash: the pinned section adds scroll length after first paint,
    // so re-align to the target once the triggers have measured.
    if (location.hash.length > 1) {
      const target = $(location.hash);
      if (target) {
        ScrollTrigger.refresh();
        lenis.scrollTo(target, { immediate: true });
      }
    }
  }

  /* Hours widget (Bahrain time, UTC+3) */
  const hours = $("[data-hours]");
  if (hours) {
    const bahrainNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bahrain" }));
    const dayEl = $("[data-hours-day]", hours)!;
    let day = bahrainNow().getDay();
    const render = () => {
      dayEl.textContent = DAYS[day];
      const [name, when] = NIGHTS[day] || ["Island vibes", "All day"];
      $("[data-hours-night]", hours)!.textContent = name;
      $("[data-hours-when]", hours)!.textContent = when;
    };
    const shift = (n: number) => {
      day = (day + n + 7) % 7;
      render();
      if (motion) gsap.fromTo(dayEl, { x: n * 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45 });
    };
    $("[data-hours-prev]", hours)!.addEventListener("click", () => shift(-1), { signal });
    $("[data-hours-next]", hours)!.addEventListener("click", () => shift(1), { signal });
    render();

    const h = bahrainNow().getHours();
    const isOpen = h >= OPEN_HOUR || h < CLOSE_HOUR;
    const state = $("[data-hours-state]", hours)!;
    state.classList.toggle("is-closed", !isOpen);
    $("span", state)!.textContent = isOpen ? "Open now · until 2 AM" : "Closed · opens 12 PM";
  }

  /* Reservation form → opens a pre-filled email to the restaurant (replaced by real bookings in phase 2) */
  const form = $<HTMLFormElement>("[data-reserve]");
  if (form) {
    const date = form.elements.namedItem("date") as HTMLInputElement | null;
    if (date) date.min = new Date().toISOString().slice(0, 10);
    form.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
        const body = [`Name: ${d.name}`, `Phone: ${d.phone}`, `Date: ${d.date}`, `Time: ${d.time}`, `Guests: ${d.guests}`, d.notes ? `Notes: ${d.notes}` : ""]
          .filter(Boolean)
          .join("\n");
        const subject = `Table request — ${d.date} ${d.time}, ${d.guests} guests`;
        location.href = `mailto:${form.dataset.reserve}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      },
      { signal }
    );
  }

  /* Menu page: highlight the active category tab */
  const tabs = $$<HTMLAnchorElement>(".tabs a");
  if (tabs.length) {
    tabsObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          tabs.forEach((a) => a.classList.toggle("is-active", a.hash === `#${e.target.id}`));
        }),
      { rootMargin: "-40% 0px -55% 0px" }
    );
    $$(".course").forEach((c) => tabsObserver!.observe(c));
  }

  return () => {
    ac.abort();
    tabsObserver?.disconnect();
    ctx?.revert();
    if (lenisTick) gsap.ticker.remove(lenisTick);
    lenis?.destroy();
    root.classList.remove("gsap-on");
    document.body.style.overflow = "";
  };
}
