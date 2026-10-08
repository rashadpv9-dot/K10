// Kingston 10 — site interactions (no dependencies)
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.documentElement.classList.remove("no-js");

  // Open daily 12:00 → 02:00 (next day). Edit here if hours change.
  const OPEN_HOUR = 12;
  const CLOSE_HOUR = 2;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const NIGHTS = {
    0: ["Sunday Service", "Afro Grill & Music · 1 PM till late"],
    4: ["One Love Thursdays", "Live DJs"],
    5: ["Reggae Brunch Fest", "3 PM – 7 PM"],
    6: ["Games & Giggles", "6 PM till late · coming soon"],
  };

  /* Sticky header state */
  const header = $(".header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-stuck", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* Mobile drawer */
  const burger = $(".burger");
  const drawer = $(".drawer");
  if (burger && drawer) {
    const setOpen = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      drawer.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    };
    burger.addEventListener("click", () => setOpen(burger.getAttribute("aria-expanded") !== "true"));
    drawer.addEventListener("click", (e) => e.target.closest("a") && setOpen(false));
    addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  }

  /* Ticker: duplicate the group so the loop is seamless */
  const track = $(".ticker__track");
  if (track && !reduceMotion) {
    const clone = track.firstElementChild.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  }

  /* Reveal on scroll */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* Dish carousel.
     Wide screens: scroll-driven — the section pins, vertical scroll moves the rail
     sideways, the centred plate scales up and the background changes per dish.
     Small screens / reduced motion: plain swipeable scroll-snap rail. */
  const rail = $(".plates__rail");
  if (rail) {
    const section = rail.closest(".plates");
    const pin = $(".plates__pin", section);
    const plates = $$(".plate", rail);
    const count = $("[data-plates-count]", section);
    const bar = $("[data-plates-bar]", section);
    const wide = matchMedia("(min-width: 901px) and (min-height: 620px)");
    const last = plates.length - 1;
    const colors = plates.map((p) => (p.dataset.bg || "#15110d").match(/\w\w/g).map((h) => parseInt(h, 16)));
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    let pinned = false;
    let travel = 0;
    let ticking = false;

    const stepScroll = () => (section.offsetHeight - innerHeight) / last;

    const update = () => {
      ticking = false;
      if (!pinned) return;
      const p = clamp(-section.getBoundingClientRect().top / (section.offsetHeight - innerHeight), 0, 1);
      const pos = p * last;
      rail.style.transform = `translate3d(${-p * travel}px,0,0)`;

      const i = Math.min(Math.floor(pos), last - 1);
      const t = pos - i;
      const mix = colors[i].map((c, k) => Math.round(c + (colors[i + 1][k] - c) * t));
      section.style.backgroundColor = `rgb(${mix.join(" ")})`;

      plates.forEach((plate, n) => {
        const d = n - pos;
        const near = Math.min(Math.abs(d), 1);
        plate.style.transform = `scale(${1 - near * 0.24})`;
        plate.style.opacity = 1 - Math.min(Math.abs(d), 1.6) * 0.38;
        plate.firstElementChild.firstElementChild.style.transform = `rotate(${d * 38}deg)`;
      });
      if (count) count.textContent = `0${Math.round(pos) + 1} / 0${plates.length}`;
      if (bar) bar.style.transform = `scaleX(${p})`;
    };

    const measure = () => {
      pinned = wide.matches && !reduceMotion && last > 0;
      section.classList.toggle("is-pinned", pinned);
      if (!pinned) {
        section.style.removeProperty("background-color");
        rail.style.removeProperty("transform");
        plates.forEach((plate) => {
          plate.removeAttribute("style");
          plate.firstElementChild.firstElementChild.removeAttribute("style");
        });
        return;
      }
      const w = plates[0].offsetWidth;
      travel = (w + parseFloat(getComputedStyle(rail).columnGap)) * last;
      section.style.setProperty("--travel", `${travel}px`);
      section.style.setProperty("--pad", `${(pin.clientWidth - w) / 2}px`);
      update();
    };

    addEventListener("scroll", () => !ticking && (ticking = true) && requestAnimationFrame(update), { passive: true });
    addEventListener("resize", measure);
    addEventListener("load", measure);
    measure();

    const go = (dir) => {
      if (pinned) return scrollBy({ top: dir * stepScroll(), behavior: "smooth" });
      const step = plates[0].getBoundingClientRect().width + 32;
      rail.scrollBy({ left: dir * step, behavior: "smooth" });
    };
    $("[data-plates-prev]")?.addEventListener("click", () => go(-1));
    $("[data-plates-next]")?.addEventListener("click", () => go(1));
  }

  /* Count-up numbers */
  const counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const end = Number(e.target.dataset.count);
        const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min((t - t0) / 1400, 1);
          e.target.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
    );
    counters.forEach((el) => io.observe(el));
  }

  /* Hours widget (Bahrain time, UTC+3) */
  const hours = $("[data-hours]");
  if (hours) {
    const bahrainNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bahrain" }));
    let day = bahrainNow().getDay();
    const render = () => {
      $("[data-hours-day]", hours).textContent = DAYS[day];
      const [name, when] = NIGHTS[day] || ["Island vibes", "All day"];
      $("[data-hours-night]", hours).textContent = name;
      $("[data-hours-when]", hours).textContent = when;
    };
    const shift = (n) => {
      day = (day + n + 7) % 7;
      render();
    };
    $("[data-hours-prev]", hours).addEventListener("click", () => shift(-1));
    $("[data-hours-next]", hours).addEventListener("click", () => shift(1));
    render();

    const h = bahrainNow().getHours();
    const isOpen = h >= OPEN_HOUR || h < CLOSE_HOUR;
    const state = $("[data-hours-state]", hours);
    state.classList.toggle("is-closed", !isOpen);
    $("span", state).textContent = isOpen ? "Open now · until 2 AM" : "Closed · opens 12 PM";
  }

  /* Reservation form → opens a pre-filled email to the restaurant */
  const form = $("[data-reserve]");
  if (form) {
    const date = form.elements.date;
    if (date) date.min = new Date().toISOString().slice(0, 10);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const body = [
        `Name: ${d.name}`,
        `Phone: ${d.phone}`,
        `Date: ${d.date}`,
        `Time: ${d.time}`,
        `Guests: ${d.guests}`,
        d.notes ? `Notes: ${d.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const subject = `Table request — ${d.date} ${d.time}, ${d.guests} guests`;
      location.href = `mailto:${form.dataset.reserve}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  /* Menu page: highlight the active category tab */
  const tabs = $$(".tabs a");
  if (tabs.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          tabs.forEach((a) => a.classList.toggle("is-active", a.hash === `#${e.target.id}`));
        }),
      { rootMargin: "-40% 0px -55% 0px" }
    );
    $$(".course").forEach((c) => io.observe(c));
  }

  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
