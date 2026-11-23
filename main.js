/* Shakthi Hari — interactions: smooth scroll, reveals, fit text, tickers,
   cursor preview, filters, lightbox. No dependencies. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const raf = requestAnimationFrame;
  const tickers = [];   // per-frame callbacks driven by the scroll loop

  /* ---------- keep images and videos from being saved: no context menu, drag or long-press save ---------- */
  const MEDIA = "img, video, picture, canvas, svg image";
  addEventListener("contextmenu", (ev) => { if (ev.target.closest?.(MEDIA)) ev.preventDefault(); });
  addEventListener("dragstart", (ev) => { if (ev.target.closest?.(MEDIA)) ev.preventDefault(); });

  /* ---------- smooth scroll (eased lerp on the real window scroll) ---------- */
  const scroll = { y: scrollY, target: scrollY, v: 0, active: false, locked: false };
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  if (fine && !reduce) {
    root.classList.add("smooth");
    addEventListener("wheel", (ev) => {
      if (ev.ctrlKey || scroll.locked) return;
      if (ev.target.closest && ev.target.closest("[data-native-scroll]")) return;
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? innerHeight : 1;
      scroll.target = Math.max(0, Math.min(maxY(), scroll.target + ev.deltaY * unit));
      scroll.active = true;
    }, { passive: false });
    // keyboard / scrollbar / find-in-page: follow the native position
    addEventListener("scroll", () => { if (!scroll.active) { scroll.y = scroll.target = scrollY; } });
  }
  scroll.to = (y) => {
    y = Math.max(0, Math.min(maxY(), y));
    if (root.classList.contains("smooth")) { scroll.target = y; scroll.active = true; }
    else scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  };

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(64, now - last) / 1000; last = now;
    if (scroll.active) {
      const prev = scroll.y;
      scroll.y += (scroll.target - scroll.y) * (1 - Math.exp(-dt * 9));
      if (Math.abs(scroll.target - scroll.y) < 0.4) { scroll.y = scroll.target; scroll.active = false; }
      scrollTo(0, scroll.y);
      scroll.v = (scroll.y - prev) / Math.max(dt, 0.001);
    } else {
      const prev = scroll.y; scroll.y = scrollY;
      scroll.v += ((scroll.y - prev) / Math.max(dt, 0.001) - scroll.v) * 0.2;
    }
    for (const t of tickers) t(dt);
    raf(loop);
  };
  raf(loop);

  // in-page anchors
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    const el = document.querySelector(a.getAttribute("href"));
    if (el) { ev.preventDefault(); scroll.to(el.getBoundingClientRect().top + scrollY); }
  });

  /* ---------- fit text: scale a single line to its container's width ---------- */
  const fits = [...document.querySelectorAll("[data-fit]")];
  const fit = () => {
    for (const el of fits) {
      const box = el.parentElement;
      el.style.fontSize = "100px";
      const w = el.getBoundingClientRect().width;
      const avail = box.clientWidth;
      if (w > 0) el.style.fontSize = (100 * avail / w).toFixed(2) + "px";
    }
    root.classList.add("fitted");
  };
  fit();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
  let rT; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(fit, 60); });

  /* ---------- entrance ---------- */
  // one painted frame of the start state, then animate; fonts gate it so the name lands sized
  const start = () => setTimeout(() => document.body.classList.add("loaded"), 40);
  const ready = () => (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 700))]) : Promise.resolve()).then(start);
  // pages hovered in the menubar are prerendered in the background (speculation rules in <head>);
  // hold their entrance until they're actually shown so it still plays
  if (document.prerendering) document.addEventListener("prerenderingchange", ready, { once: true }); else ready();

  /* ---------- reveal on scroll ---------- */
  // About reveals quicker: starts just before text scrolls in, and only items arriving together stagger
  const quick = document.body.classList.contains("about-pg");
  const proj = !!document.querySelector(".proj, .works");   // project pages + Work grid: quick reveal
  const io = new IntersectionObserver((entries) => {
    let batch = 0;
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      if (quick || proj) el.style.setProperty("--rd", Math.min(batch++, 3) * 0.04 + "s");
      else {
        // stagger siblings that enter together
        const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.hasAttribute("data-r")) : [];
        const idx = Math.max(0, sib.indexOf(el));
        el.style.setProperty("--rd", Math.min(idx, 6) * 0.06 + "s");
      }
      el.classList.add("in");
      io.unobserve(el);
    }
  }, { rootMargin: quick || proj ? "0px 0px 12% 0px" : "0px 0px -8% 0px", threshold: 0.01 });
  const watch = (scope) => scope.querySelectorAll("[data-r]:not(.in)").forEach((el) => io.observe(el));
  watch(document);
  // project pages: start fetching images a screen and a half before they scroll in (native lazy
  // loading waits until they're nearly on screen, so they faded in before the pixels arrived)
  if (proj) {
    const pre = new IntersectionObserver((es) => es.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.loading = "eager"; pre.unobserve(en.target);
    }), { rootMargin: "0px 0px 150% 0px" });
    document.querySelectorAll('.proj img[loading="lazy"]').forEach((im) => pre.observe(im));
  }

  /* ---------- self-hosted loops: load when near, play only while visible ---------- */
  const vio = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const v = en.target;
      if (en.isIntersecting) {
        if (!v.src) { v.src = v.dataset.lazy; v.preload = "auto"; }
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      } else if (!v.paused) v.pause();
    }
  }, { rootMargin: "300px 0px" });
  document.querySelectorAll("video[data-lazy]").forEach((v) => vio.observe(v));

  /* ---------- nav contact: hover opens a glass box with the email; clicking it copies ----------
     A short close delay lets the pointer travel from the pill to the box without flicker. */
  const navRight = document.querySelector(".nv-mid");   // the group that holds Contact and its email box
  const drop = navRight && navRight.querySelector(".nv-drop");
  if (drop) {
    let closeT = 0, doneT = 0;
    const open = () => { clearTimeout(closeT); navRight.classList.add("open"); };
    const shut = () => { clearTimeout(closeT); closeT = setTimeout(() => navRight.classList.remove("open"), 180); };
    // only the Contact pill and the box itself open it (not the theme toggle beside it)
    const pillC = navRight.querySelector(".nv-contact");
    // there's no contact page any more: a mouse opens the box on hover (its click keeps it open);
    // touch and keyboard toggle it with a tap / Enter
    let via = "";
    pillC.addEventListener("pointerdown", (ev) => { via = ev.pointerType; });
    pillC.addEventListener("click", () => {
      const on = via === "mouse" ? true : !navRight.classList.contains("open");
      via = ""; clearTimeout(closeT); navRight.classList.toggle("open", on); pillC.setAttribute("aria-expanded", on);
    });
    document.addEventListener("pointerdown", (ev) => { if (!navRight.contains(ev.target)) { navRight.classList.remove("open"); pillC.setAttribute("aria-expanded", false); } });
    for (const el of [pillC, drop]) {
      el.addEventListener("pointerenter", open);
      el.addEventListener("pointerleave", shut);
      el.addEventListener("focus", open);
      el.addEventListener("blur", (ev) => { if (ev.relatedTarget !== pillC && ev.relatedTarget !== drop) shut(); });
    }
    const fallback = (mail) => {
      const t = Object.assign(document.createElement("textarea"), { value: mail });
      document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (_) {} t.remove();
    };
    drop.addEventListener("click", () => {
      const mail = drop.dataset.email;
      if (navigator.clipboard) navigator.clipboard.writeText(mail).catch(() => fallback(mail)); else fallback(mail);
      drop.classList.add("copied");
      clearTimeout(doneT);
      doneT = setTimeout(() => drop.classList.remove("copied"), 1800);
    });
  }
  setTimeout(() => document.documentElement.classList.add("nv-seen"), 2500);

  /* ---------- name pill: size it to the label that's showing (name, or "back to home" on hover) ---------- */
  const swap = document.querySelector(".nv-logo:not(.nv-static) .nv-swap");
  if (swap && swap.children.length > 1) {
    const size = () => {
      const [a, b] = [...swap.children].map((el) => Math.ceil(el.getBoundingClientRect().width));
      swap.style.setProperty("--w1", a + "px"); swap.style.setProperty("--w2", b + "px"); swap.classList.add("sized");
    };
    size();
    if (document.fonts) document.fonts.ready.then(size);
  }

  /* ---------- Fun categories: draw the bracket from the Fun pill to the centred category row ---------- */
  const subRow = document.querySelector(".nv-sub"), subLink = document.querySelector(".nv-link");
  if (subRow && subLink) {
    const fun = document.querySelector('.nv-mid a[href="/play"]');
    const place = () => {
      if (!fun) return;
      // positions relative to .nv-mid (the shared containing block)
      const fc = fun.offsetLeft + fun.offsetWidth / 2;
      const rl = subRow.offsetLeft - subRow.offsetWidth / 2, rr = rl + subRow.offsetWidth;   // row is translated -50%
      const l = Math.min(rl, fc), r = Math.max(rr, fc);
      subLink.style.left = l + "px"; subLink.style.width = r - l + "px"; subLink.style.setProperty("--stem", fc - l + "px");
    };
    place(); addEventListener("resize", place);
    if (document.fonts) document.fonts.ready.then(place);
    // off the Fun page: hovering Fun peeks the row out; it stays while the pointer is on Fun or the row
    if (subRow.classList.contains("peek") && fun) {
      const mid = subRow.closest(".nv-mid");
      let t = 0;
      const show = (ev) => { if (ev.pointerType === "touch") return; clearTimeout(t); place(); mid.classList.add("peeking"); };
      const hide = () => { clearTimeout(t); t = setTimeout(() => mid.classList.remove("peeking"), 220); };
      for (const el of [fun, subRow, subLink]) { el.addEventListener("pointerenter", show); el.addEventListener("pointerleave", hide); }
    }
  }

  /* ---------- right-hand dropdowns: hover opens, a short delay lets the pointer reach the box ---------- */
  const navR = document.querySelector(".nv-right");
  const dropdown = (pill, box, toggleOnClick) => {
    let t = 0, via = "";
    const set = (on) => { clearTimeout(t); box.classList.toggle("on", on); pill.setAttribute("aria-expanded", on); };
    const later = () => { clearTimeout(t); t = setTimeout(() => set(false), 180); };
    for (const el of [pill, box]) {
      el.addEventListener("pointerenter", (ev) => { if (ev.pointerType !== "touch") set(true); });
      el.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") later(); });
      el.addEventListener("focusout", (ev) => { if (!pill.contains(ev.relatedTarget) && !box.contains(ev.relatedTarget)) later(); });
    }
    pill.addEventListener("pointerdown", (ev) => { via = ev.pointerType; });
    // Social: a mouse already opened it on hover, so its click keeps it open; touch / keyboard toggle it
    if (toggleOnClick) pill.addEventListener("click", () => { set(via === "mouse" ? true : !box.classList.contains("on")); via = ""; });
    pill.addEventListener("keydown", (ev) => { if (ev.key === "ArrowDown") { ev.preventDefault(); set(true); box.querySelector("a, button")?.focus(); } });
    document.addEventListener("pointerdown", (ev) => { if (!pill.contains(ev.target) && !box.contains(ev.target)) set(false); });
    addEventListener("keydown", (ev) => { if (ev.key === "Escape" && box.classList.contains("on")) { set(false); pill.focus(); } });
    return set;
  };
  const sPill = navR && navR.querySelector(".nv-social"), sDrop = navR && navR.querySelector(".nv-sdrop");
  if (sPill && sDrop) dropdown(sPill, sDrop, true);

  /* ---------- colour themes: Dark (default), Light, or a palette; saved per visitor and revealed as a
     circle growing from the switch. Clicking the switch flips light/dark; its dropdown lists them all. ---------- */
  const themeBtn = document.getElementById("themeBtn");
  const themeMeta = document.querySelector("meta[name=theme-color]");
  const tDrop = navR && navR.querySelector(".nv-tdrop");
  const picks = tDrop ? [...tDrop.querySelectorAll("[data-pick]")] : [];
  const current = () => document.documentElement.dataset.palette || (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const isLight = () => document.documentElement.dataset.theme === "light";
  const mark = () => { const c = current(); picks.forEach((b) => b.setAttribute("aria-checked", b.dataset.pick === c)); };
  const applyTheme = (name) => {
    const root = document.documentElement, pick = picks.find((b) => b.dataset.pick === name);
    const sw = pick && pick.querySelector(".tp-sw");
    const bg = sw ? sw.style.getPropertyValue("--sb").trim() : (name === "light" ? "#ffffff" : "#000000");
    // a palette's base is light when its page colour is light
    const light = name === "light" || (name !== "dark" && sw && parseInt(bg.slice(1, 3), 16) * .299 + parseInt(bg.slice(3, 5), 16) * .587 + parseInt(bg.slice(5, 7), 16) * .114 > 140);
    if (light) root.dataset.theme = "light"; else delete root.dataset.theme;
    if (name === "light" || name === "dark") delete root.dataset.palette; else root.dataset.palette = name;
    if (themeMeta) themeMeta.content = bg;
    if (themeBtn) themeBtn.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    try { localStorage.theme = name; } catch (_) {}
    mark();
    window.dispatchEvent(new Event("themechange"));
  };
  const reveal = (name) => {
    if (name === current()) return;
    if (!document.startViewTransition || reduce || !themeBtn) { applyTheme(name); return; }
    const r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const root = document.documentElement.style;
    root.setProperty("--tx", x + "px"); root.setProperty("--ty", y + "px");
    root.setProperty("--tr", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
    document.documentElement.classList.add("theme-vt");
    const vt = document.startViewTransition(() => applyTheme(name));
    vt.finished.finally(() => document.documentElement.classList.remove("theme-vt"));
  };
  if (themeBtn) {
    if (isLight()) themeBtn.setAttribute("aria-label", "Switch to dark mode");
    themeBtn.addEventListener("click", () => reveal(isLight() ? "dark" : "light"));
  }
  if (themeBtn && tDrop) {
    themeBtn.setAttribute("aria-haspopup", "true"); themeBtn.setAttribute("aria-expanded", "false");
    dropdown(themeBtn, tDrop, false);
    mark();
    tDrop.addEventListener("click", (ev) => { const b = ev.target.closest("[data-pick]"); if (b) reveal(b.dataset.pick); });
  }

  /* ---------- card images: fade in over their blurred preview once decoded ---------- */
  const shown = (im) => im.classList.add("ld");
  const watchCards = (root) => root.querySelectorAll(".card-media img:not(.ld)").forEach((im) => {
    if (im.complete && im.naturalWidth) shown(im);
    else { im.addEventListener("load", () => shown(im), { once: true }); im.addEventListener("error", () => shown(im), { once: true }); }
  });
  watchCards(document);
  // look-ahead loading: a card's image starts loading once it is within one screen below the
  // viewport (half a screen above), so it is usually ready before it scrolls in
  const ahead = new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    const im = en.target.querySelector("img[data-src]");
    ahead.unobserve(en.target);
    if (!im) return;
    // tell the browser the card's real width (cards in a row aren't all half the screen), so it
    // fetches a copy sharp enough for it instead of guessing from the generic "50vw"
    const real = Math.ceil(en.target.getBoundingClientRect().width) + "px";
    en.target.querySelectorAll("source[data-srcset]").forEach((so) => { so.sizes = real; so.srcset = so.dataset.srcset; so.removeAttribute("data-srcset"); });
    if (im.dataset.srcset) { im.sizes = real; im.srcset = im.dataset.srcset; im.removeAttribute("data-srcset"); }
    im.loading = "eager"; im.src = im.dataset.src; im.removeAttribute("data-src");
  }), { rootMargin: "50% 0px 100% 0px" });
  const watchAhead = (root) => root.querySelectorAll(".card-media").forEach((m) => { if (m.querySelector("img[data-src]")) ahead.observe(m); });
  watchAhead(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) watchAhead(n); })))
    .observe(document.body, { childList: true, subtree: true });
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) watchCards(n); })))
    .observe(document.body, { childList: true, subtree: true });

  /* ---------- nav: mobile menu ---------- */
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuBtn.setAttribute("aria-expanded", open);
    document.getElementById("menu").setAttribute("aria-hidden", !open);
    scroll.locked = open;
    document.body.style.overflow = open ? "hidden" : "";
  });

  /* ---------- clock ---------- */
  // live clocks: every [data-tz] shows the time in its zone (Sunnyvale PT and India IST on the home page)
  const clocks = [...document.querySelectorAll("[data-tz]")].map((el) => ({
    el, fmt: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: el.dataset.tz, hour12: true }) }));
  if (clocks.length) {
    const tick = () => { const now = new Date(); for (const c of clocks) c.el.textContent = c.fmt.format(now); };
    tick(); setInterval(tick, 10000);
  }

  /* ---------- hero: recede as the work slides over it ---------- */
  const heroMain = document.querySelector(".hero-main");
  const heroBottom = document.querySelector(".hero-bottom");
  let heroP = -1;
  if (heroMain && !reduce) tickers.push(() => {
    const p = Math.min(1, Math.max(0, scroll.y / innerHeight));
    if (p === heroP) return;
    heroP = p;
    heroMain.style.transform = `translate3d(0, ${p * -12}vh, 0) scale(${1 - p * 0.06})`;
    heroMain.style.opacity = String(1 - p * 0.9);
    if (heroBottom) heroBottom.style.opacity = String(1 - p * 1.4);
  });

  /* ---------- cursor image trail (alternate hero) ----------
     A new image every ~95px of travel,
     springs in from scale 0, holds 0.6s, shrinks out. Order is shuffled per visit. */
  const trail = document.getElementById("trail");
  const poolEl = document.getElementById("trailPool");
  if (trail && poolEl && fine && !reduce) {
    const pool = JSON.parse(poolEl.textContent);
    for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const hero = trail.parentElement;
    const GAP = 95, HOLD = 600, H = 240, MAXW = 340;
    let idx = 0, last = null, z = 1, pend = null, rect = null;
    // keep the next few images downloaded *and decoded*, so showing one never stalls a frame
    const warm = new Map();
    const preload = (n) => {
      for (let k = 0; k < n; k++) {
        const p = pool[(idx + k) % pool.length];
        if (warm.has(p[0])) continue;
        const im = new Image(); im.decoding = "async"; im.src = p[0];
        const w = { im, ready: false };
        im.decode().then(() => { w.ready = true; }, () => {});
        warm.set(p[0], w);
      }
    };
    const AHEAD = 24;   // WebP decodes a touch slower than the old JPEGs, so keep more ready
    preload(AHEAD);
    const spawn = (x, y) => {
      // skip anything not yet decoded rather than block on it
      for (let tries = 0; tries < pool.length; tries++) {
        const w = warm.get(pool[idx][0]);
        if (w && w.ready) break;
        idx = (idx + 1) % pool.length;
        if (tries > AHEAD) return;
      }
      const [src, w, h] = pool[idx]; idx = (idx + 1) % pool.length;
      preload(AHEAD);
      let ih = H, iw = H * w / h;
      if (iw > MAXW) { iw = MAXW; ih = MAXW * h / w; }
      const im = warm.get(src).im.cloneNode();
      warm.delete(src);
      im.alt = ""; im.decoding = "async";
      im.style.cssText = `width:${iw}px;height:${ih}px;z-index:${z++}`;
      trail.appendChild(im);
      const at = `translate3d(${x - iw / 2}px, ${y - ih / 2}px, 0)`;
      // Web Animations run on the compositor: no forced layout, no per-frame JS
      const grow = im.animate([{ transform: `${at} scale(0)` }, { transform: `${at} scale(1)` }],
        { duration: 1000, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "forwards" });
      setTimeout(() => {
        grow.cancel();
        im.animate([{ transform: `${at} scale(1)` }, { transform: `${at} scale(0)` }],
          { duration: 550, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" }).finished.then(() => im.remove(), () => im.remove());
      }, HOLD);
    };
    // one update per frame; fast flicks drop images along the path instead of leaving gaps
    const step = () => {
      const p = pend; pend = null;
      if (!p) return;
      if (!last) { last = p; spawn(p.x, p.y); return; }
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d <= GAP) return;
      const n = Math.min(3, Math.floor(d / GAP));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        spawn(last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t);
      }
      last = p;
    };
    // no trail under the menubar: the band runs to just below its lowest pill
    const nav = document.getElementById("nav");
    let band = null;
    const navBand = () => {
      let b = 0;
      if (nav) for (const el of nav.querySelectorAll(".nv-chip, .nv-logo, .nv-menu")) b = Math.max(b, el.getBoundingClientRect().bottom);
      return b + 16;
    };
    hero.addEventListener("mousemove", (ev) => {
      if (band === null) band = navBand();
      if (ev.clientY < band) { pend = null; last = null; return; }
      if (!rect) rect = hero.getBoundingClientRect();
      const first = !pend;
      pend = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (first) requestAnimationFrame(step);
    }, { passive: true });
    addEventListener("scroll", () => { rect = null; }, { passive: true });
    addEventListener("resize", () => { rect = null; band = null; });
    hero.addEventListener("mouseleave", () => { last = null; });
  }

  /* ---------- footer: fixed underneath, slides from +300px to 0 as the page uncovers it ---------- */
  const foot = document.getElementById("foot");
  const footSpace = document.getElementById("footSpace");
  if (foot && footSpace) {
    // measured once (and on resize / height changes), not every frame: reading layout in the
    // loop forced a style + layout pass per frame on pages that animate something else
    const stacked = matchMedia("(max-width: 809.98px)");
    let spaceY = 0, lastP = -1;
    const measure = () => { spaceY = footSpace.getBoundingClientRect().top + scrollY; lastP = -1; };
    measure(); addEventListener("resize", measure); new ResizeObserver(measure).observe(document.body);
    tickers.push(() => {
      if (stacked.matches) { if (lastP !== -2) { foot.style.transform = ""; foot.style.visibility = ""; lastP = -2; } return; }
      const p = Math.min(1, Math.max(0, 1 - (spaceY - scroll.y) / innerHeight));
      if (p === lastP) return;
      lastP = p;
      foot.style.transform = `translate3d(0, ${(1 - p) * 300}px, 0)`;
      foot.style.visibility = p > 0 ? "visible" : "hidden";
      root.classList.toggle("foot-in", p > 0.01);
    });
  }

  /* ---------- footer links: letters scramble, then resolve in random order ---------- */
  document.querySelectorAll("[data-scr]").forEach((a) => {
    const text = a.dataset.scr;
    const pool = [...new Set(text.replace(/\s/g, ""))];
    let timer = null;
    a.addEventListener("mouseenter", () => {
      if (reduce) return;
      clearInterval(timer);
      const order = [...text].map((_, i) => i).filter((i) => text[i] !== " ").sort(() => Math.random() - 0.5);
      const done = new Set();
      a.style.minWidth = a.offsetWidth + "px";
      timer = setInterval(() => {
        if (order.length) done.add(order.shift());
        a.textContent = [...text].map((c, i) => (c === " " || done.has(i) ? c : pool[(Math.random() * pool.length) | 0])).join("");
        if (!order.length) { clearInterval(timer); a.textContent = text; }
      }, 1000 / 20);
    });
  });

  /* ---------- footer ASCII portrait (WebGL) ----------
     Every character is its own particle, picked by brightness from a density
     ramp and drawn in greys. Hover opens a restless, twitching circular hole and scrambles letters along
     the cursor's path; press and hold to charge, release to blast — the longer the hold, the
     bigger the explosion — and the letters settle back into the portrait. */
  const glyph = document.getElementById("glyph");
  if (glyph) (() => {
    const foot = glyph.closest(".foot"), canvas = foot.querySelector(".ft-canvas");
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    const CHARS = ".:-=+*#%@", ROWS = 130, CELL_W = 0.6, TRAIL = 10, BLASTS = 4;
    const VS = `precision highp float;
attribute vec2 aPos, aVal, aRnd;
uniform vec2 uRes, uCell, uMouse; uniform float uHover, uRepelR, uScrR, uTime, uLight, uCount, uBlastR, uBlastD, uCharge;
uniform vec2 uTrail[${TRAIL}]; uniform vec2 uBlastO[${BLASTS}]; uniform float uBlastT[${BLASTS}], uBlastP[${BLASTS}]; uniform vec3 uHi;
varying float vChar, vSpin; varying vec4 vCol;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 p = aPos;
  // blast: letters fly out from the click, hang for a beat, then ease back home
  vec2 off = vec2(0.0); float spin = 0.0, burst = 0.0;
  for (int i = 0; i < ${BLASTS}; i++) {
    // bigger charges reach further, throw harder and hang in the air longer
    float pw = uBlastP[i], t = uBlastT[i] / (0.75 + 0.25 * pw);
    if (uBlastT[i] >= 0.0 && t < 2.5) {
      vec2 v = aPos - uBlastO[i]; float d = length(v);
      float s = exp(-d / (uBlastR * (0.6 + 0.55 * pw)));
      float env = (1.0 - exp(-t * 18.0)) * exp(-(t * 1.5) * (t * 1.5));
      float ang = atan(v.y, v.x + 1e-4) + (aRnd.x - 0.5) * 1.6;
      off += vec2(cos(ang), sin(ang)) * uBlastD * pw * s * (0.3 + aRnd.y * 1.4) * env;
      spin += (aRnd.x - 0.5) * 14.0 * s * env;
      burst = max(burst, s * env);
    }
  }
  // repel: the cursor opens a circular hole that never sits still — it breathes and twitches,
  // and the letters on its rim shiver
  vec2 d = aPos - uMouse; float dl = length(d);
  float twitch = rand(vec2(floor(uTime * 9.0), 3.7)) - 0.5;
  float wob = 1.0 + 0.08 * sin(uTime * 3.1) + 0.07 * twitch;
  float R = uRepelR * wob;
  float hole = R * 0.42 * max(uHover, 0.0) * (1.0 - 0.85 * uCharge);
  float rim = 0.0;
  if (dl < R && hole > 0.0) {
    p = uMouse + d / max(dl, 1e-4) * (hole + dl * (R - hole) / R);
    rim = smoothstep(R, hole, length(p - uMouse)) * smoothstep(hole * 0.9, hole * 1.6, length(p - uMouse));
  }
  // charge: while the button is held, nearby letters are sucked toward the cursor and shake harder and harder
  float k = smoothstep(uRepelR * (1.0 + 1.4 * uCharge), 0.0, dl) * uCharge;
  p = mix(p, uMouse, k * 0.45);
  float tk = floor(uTime * 30.0);
  vec2 shake = vec2(rand(aRnd + tk * 0.37), rand(aRnd.yx + tk * 0.91)) - 0.5;
  p += shake * uCell.y * (rim * 0.9 * clamp(uHover, 0.0, 1.0) + k * 2.6);
  p += off;
  // scramble: around the cursor, along its path, and while blasted, letters flicker through the ramp
  float hv = clamp(uHover, 0.0, 1.0);
  float near = smoothstep(uScrR, uRepelR * 0.4, dl) * hv, trail = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    float age = 1.0 - float(i) / ${TRAIL}.0;
    trail = max(trail, smoothstep(uScrR * 0.8, 0.0, length(aPos - uTrail[i])) * age);
  }
  float lit = max(max(near, trail * hv), k);
  float scr = max(lit, smoothstep(0.04, 0.25, burst));
  float l = aVal.x;
  float ci = floor(clamp(mix(l, 1.0 - l, uLight) * 1.05, 0.0, 0.999) * uCount);
  float tick = floor(uTime * 22.0);
  if (rand(aRnd * 7.31 + tick * 0.173) < scr) ci = floor(rand(aRnd + tick * 0.611) * uCount);
  // monochrome: brightness becomes a grey from mid-grey to white on dark, grey to black on light
  float g = mix(0.32 + 0.68 * pow(l, 0.75), 0.62 * l, uLight);
  vCol = vec4(mix(vec3(g), uHi, clamp(lit * 0.6 + burst * 0.5, 0.0, 1.0)), aVal.y);
  vChar = ci; vSpin = spin;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uCell.y;
}`;
    const FS = `precision highp float;
uniform sampler2D tAscii; uniform vec2 uCell; uniform float uCount;
varying float vChar, vSpin; varying vec4 vCol;
void main(){
  vec2 pc = gl_PointCoord - 0.5; float c = cos(vSpin), s = sin(vSpin);
  pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y);
  float u = pc.x * uCell.y / uCell.x + 0.5, v = 0.5 - pc.y;
  if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;
  float a = texture2D(tAscii, vec2((vChar + u) / uCount, v)).r * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const U = (n) => gl.getUniformLocation(prog, n);
    const A = (n) => gl.getAttribLocation(prog, n);
    const buf = gl.createBuffer();
    let count = 0;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // glyph atlas, redrawn at the exact device-pixel cell size so each character maps 1:1 to
    // screen pixels (no resampling) and is sampled with NEAREST — crisp instead of pixelated
    const atlas = document.createElement("canvas");
    const c2 = atlas.getContext("2d");
    let atlasTex = null, atlasCell = 0;
    const drawAtlas = (cw, ch) => {
      if (cw * 1000 + ch === atlasCell) return;
      atlasCell = cw * 1000 + ch;
      atlas.width = cw * CHARS.length; atlas.height = ch;
      c2.fillStyle = "#000"; c2.fillRect(0, 0, atlas.width, ch);
      c2.fillStyle = "#fff"; c2.textAlign = "center"; c2.textBaseline = "middle";
      c2.font = `700 ${Math.round(ch * 0.82)}px "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`;
      [...CHARS].forEach((c, i) => c2.fillText(c, i * cw + cw / 2, ch / 2 + ch * 0.04));
      gl.activeTexture(gl.TEXTURE0);
      if (!atlasTex) atlasTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    };
    gl.uniform1i(U("tAscii"), 0);
    gl.uniform1f(U("uCount"), CHARS.length);
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const glyphColors = () => {
      const light = document.documentElement.dataset.theme === "light";
      gl.uniform1f(U("uLight"), light ? 1 : 0);
      gl.uniform3fv(U("uHi"), rgb(light ? "#09090b" : "#f4f4f5"));
    };
    glyphColors();
    addEventListener("themechange", () => { glyphColors(); dirty = true; });

    // W×H: the footer canvas; G: the portrait box inside it (device px, from the top-left)
    let ready = false, dirty = true, visible = false, hp = 0, hv = 0, W = 1, H = 1, dpr = 1;
    const G = { x: 0, y: 0, w: 1, h: 1 };
    const m = { x: 0, y: 0, tx: 0, ty: 0, active: 0 };
    const trailPos = new Float32Array(TRAIL * 2);
    const blasts = Array.from({ length: BLASTS }, () => ({ x: 0, y: 0, t0: -1e9, p: 1 }));
    let bIdx = 0;
    const img = new Image();
    // one particle per cell that the portrait covers: position, brightness/alpha, two randoms
    const sample = document.createElement("canvas"), sc = sample.getContext("2d", { willReadFrequently: true });
    const build = (cw, ch) => {
      if (!ready) return;
      const cols = Math.floor(G.w / cw), rows = Math.floor(G.h / ch);
      const ox = G.x + (G.w - cols * cw) / 2, oy = G.y + (G.h - rows * ch) / 2;
      // draw the photo "contain"-fitted onto a canvas with one pixel per cell
      const ia = img.width / img.height;
      const dw = G.w / G.h > ia ? G.h * ia : G.w, dh = G.w / G.h > ia ? G.h : G.w / ia;
      sample.width = cols; sample.height = rows;
      sc.clearRect(0, 0, cols, rows); sc.imageSmoothingQuality = "high";
      sc.drawImage(img, (G.x + (G.w - dw) / 2 - ox) / cw, (G.y + (G.h - dh) / 2 - oy) / ch, dw / cw, dh / ch);
      const px = sc.getImageData(0, 0, cols, rows).data;
      const out = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 4, a = px[k + 3] / 255;
        if (a < 0.05) continue;
        const l = (0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) / 255;
        out.push(ox + (i + 0.5) * cw, H - (oy + (j + 0.5) * ch), Math.min(1, l), a, Math.random(), Math.random());
      }
      count = out.length / 6;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
      [["aPos", 0], ["aVal", 2], ["aRnd", 4]].forEach(([n, o]) => { const l = A(n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 24, o * 4); });
      dirty = true;
    };
    let cell = [6, 4];
    img.onload = () => { ready = true; build(cell[1], cell[0]); };
    // the portrait only matters once the footer is near, so fetch it then
    const nearFoot = new IntersectionObserver(([en]) => { if (en.isIntersecting) { img.src = glyph.dataset.src; nearFoot.disconnect(); } }, { rootMargin: "100% 0px" });
    nearFoot.observe(glyph);
    const resize = () => {
      const r = foot.getBoundingClientRect(), g = glyph.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 3);
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      G.x = Math.round((g.left - r.left) * dpr); G.y = Math.round((g.top - r.top) * dpr);
      G.w = Math.max(1, Math.round(g.width * dpr)); G.h = Math.max(1, Math.round(g.height * dpr));
      // whole-device-pixel cells, taller than wide like a terminal character (density follows the portrait)
      const ch = Math.max(6, Math.round(G.h / ROWS)), cw = Math.max(4, Math.round(ch * CELL_W));
      cell = [ch, cw];
      canvas.width = W; canvas.height = H;
      // pin the CSS size to the backing store so the browser never rescales the canvas
      canvas.style.width = W / dpr + "px"; canvas.style.height = H / dpr + "px";
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U("uRes"), W, H); gl.uniform2f(U("uCell"), cw, ch);
      gl.uniform1f(U("uRepelR"), 0.16 * G.h); gl.uniform1f(U("uScrR"), 0.22 * G.h);
      gl.uniform1f(U("uBlastR"), 0.2 * G.h); gl.uniform1f(U("uBlastD"), 0.38 * G.h);
      drawAtlas(cw, ch); build(cw, ch);
      dirty = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(glyph); ro.observe(foot); resize();
    // redraw the atlas once Geist is ready (first pass may use the fallback face)
    if (document.fonts) document.fonts.ready.then(() => { atlasCell = 0; resize(); });
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.("change", resize);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; dirty = true; }).observe(foot);
    const pos = (ev) => { const r = foot.getBoundingClientRect(); return [(ev.clientX - r.left) * dpr, (r.bottom - ev.clientY) * dpr]; };
    foot.addEventListener("mousemove", (ev) => {
      [m.tx, m.ty] = pos(ev);
      if (!m.active) { m.x = m.tx; m.y = m.ty; for (let i = 0; i < TRAIL; i++) { trailPos[i * 2] = m.x; trailPos[i * 2 + 1] = m.y; } }
      m.active = 1; dirty = true;
    }, { passive: true });
    foot.addEventListener("mouseleave", () => { m.active = 0; dirty = true; });
    // press and hold to charge (up to 2s); letting go blasts with a power that grows with the hold
    let holdT0 = 0, charge = 0;
    const release = () => {
      if (!holdT0) return;
      const c = Math.min(1, (performance.now() - holdT0) / 2000);
      blasts[bIdx] = { x: m.x, y: m.y, t0: performance.now(), p: 0.7 + 2.6 * Math.pow(c, 1.2) };
      bIdx = (bIdx + 1) % BLASTS; holdT0 = 0; dirty = true;
    };
    foot.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest("a, button")) return;
      [m.tx, m.ty] = pos(ev); m.x = m.tx; m.y = m.ty; holdT0 = performance.now(); dirty = true;
    });
    addEventListener("pointerup", release);
    foot.addEventListener("pointerleave", release);
    const bOrigin = new Float32Array(BLASTS * 2), bAge = new Float32Array(BLASTS), bPow = new Float32Array(BLASTS);
    tickers.push(() => {
      if (!ready || !visible || !count) return;
      const now = performance.now();
      let blasting = false;
      blasts.forEach((b, i) => {
        const t = (now - b.t0) / 1000, life = 2.5 * (0.75 + 0.25 * (b.p || 1));
        if (t < life) blasting = true;
        bOrigin[i * 2] = b.x; bOrigin[i * 2 + 1] = b.y; bAge[i] = t < life ? t : -1; bPow[i] = b.p || 1;
      });
      const moving = Math.abs(m.x - m.tx) > 0.1 || Math.abs(m.y - m.ty) > 0.1;
      // hover strength on a spring: the hole opens with a little overshoot and springs shut on leave
      hv = (hv + (m.active - hp) * 0.14) * 0.74; hp += hv;
      const springing = Math.abs(hv) > 1e-4 || Math.abs(m.active - hp) > 1e-3;
      // ease the charge in so the build-up starts gently and gets violent near the end
      const ct = holdT0 ? Math.min(1, (now - holdT0) / 2000) : 0;
      charge += ((ct * ct) - charge) * (holdT0 ? 1 : 0.25);
      const charging = holdT0 || charge > 1e-3;
      if (!dirty && !moving && !blasting && !springing && !charging && hp < 0.01) return;
      gl.uniform1f(U("uCharge"), charge);
      m.x += (m.tx - m.x) * 0.22; m.y += (m.ty - m.y) * 0.22;
      trailPos.copyWithin(2, 0, TRAIL * 2 - 2); trailPos[0] = m.x; trailPos[1] = m.y;
      gl.uniform2f(U("uMouse"), m.x, m.y); gl.uniform1f(U("uHover"), hp); gl.uniform1f(U("uTime"), now / 1000);
      gl.uniform2fv(U("uTrail[0]"), trailPos);
      gl.uniform2fv(U("uBlastO[0]"), bOrigin); gl.uniform1fv(U("uBlastT[0]"), bAge); gl.uniform1fv(U("uBlastP[0]"), bPow);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
      dirty = false;
    });
  })();

  /* ---------- project hero grows to full width ---------- */
  const grow = document.querySelector("[data-grow]");
  if (grow && !reduce) {
    let growY = 0, growP = -1;
    const measureGrow = () => { const t = grow.style.transform; grow.style.transform = "none"; growY = grow.getBoundingClientRect().top + scrollY; grow.style.transform = t; growP = -1; };
    measureGrow(); addEventListener("resize", measureGrow); new ResizeObserver(measureGrow).observe(document.body);
    tickers.push(() => {
      const p = Math.min(1, Math.max(0, 1 - (growY - scroll.y) / innerHeight));
      if (p === growP) return;
      growP = p;
      grow.style.transform = `scale(${0.92 + 0.08 * p})`;
    });
  }

  /* ---------- tickers: constant drift, nudged by scroll speed & direction ---------- */
  document.querySelectorAll("[data-marquee]").forEach((wrap) => {
    const track = wrap.querySelector(".track");
    const base = parseFloat(wrap.dataset.marquee) || 50;
    const fixed = wrap.dataset.dir ? +wrap.dataset.dir : 0;   // data-dir pins the direction (1 = left→right)
    let x = 0, dir = fixed || -1, half = 0;
    const copy = track.querySelector(".tcopy > *");   // when the clone is marked, loop on its exact offset
    const measure = () => { half = copy ? copy.offsetLeft - track.firstElementChild.offsetLeft : track.scrollWidth / 2; };
    measure(); addEventListener("resize", measure);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);
    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(wrap);
    tickers.push((dt) => {
      if (!visible || !half) return;
      if (!fixed && Math.abs(scroll.v) > 30) dir = scroll.v > 0 ? -1 : 1;
      const boost = Math.min(6, Math.abs(scroll.v) / 400);
      x += dir * base * (1 + boost) * dt * (reduce ? 0 : 1);
      if (x <= -half) x += half; if (x > 0) x -= half;
      track.style.transform = `translate3d(${x}px,0,0)`;
    });
  });

  /* ---------- testimonial quotes: every quote starts on the same line as the longest one ---------- */
  const tq = [...document.querySelectorAll(".tmarq blockquote")];
  if (tq.length) {
    const align = () => {
      tq.forEach((q) => { q.style.minHeight = ""; });
      const h = Math.max(...tq.map((q) => q.offsetHeight));
      tq.forEach((q) => { q.style.minHeight = h + "px"; });
    };
    align(); addEventListener("resize", align);
    if (document.fonts) document.fonts.ready.then(align);
  }

  /* ---------- values: words light up as you scroll the pinned block ---------- */
  const values = document.getElementById("values");
  if (values) {
    const words = [...values.querySelectorAll(".vw")];
    tickers.push(() => {
      const r = values.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      words.forEach((w, i) => {
        const t = Math.min(1, Math.max(0, p * (words.length + 0.6) - i));
        w.style.opacity = String(0.12 + 0.88 * t);
      });
    });
  }

  /* ---------- cursor preview (keeps each image's own aspect ratio) ---------- */
  const pv = document.getElementById("preview");
  if (pv && fine) {
    const pimg = pv.querySelector("img");
    let mx = 0, my = 0, px = 0, py = 0, on = false, sc = 0.6;
    addEventListener("mousemove", (ev) => { mx = ev.clientX; my = ev.clientY; }, { passive: true });
    document.addEventListener("mouseover", (ev) => {
      const t = ev.target.closest && ev.target.closest("[data-preview]");
      if (t) {
        const src = t.getAttribute("data-preview");
        if (pimg.getAttribute("src") !== src) pimg.setAttribute("src", src);
        if (!on) { px = mx; py = my; }
        on = true; pv.classList.add("on");
      } else if (on) { on = false; pv.classList.remove("on"); }
    });
    tickers.push((dt) => {
      const k = 1 - Math.exp(-dt * 12);
      px += (mx - px) * k; py += (my - py) * k;
      sc += ((on ? 1 : 0.6) - sc) * (1 - Math.exp(-dt * 10));
      const tilt = Math.max(-8, Math.min(8, (mx - px) * 0.05));
      pv.style.transform = `translate3d(${px + 24}px, ${py - pv.offsetHeight / 2}px, 0) rotate(${tilt}deg) scale(${sc})`;
    });
  }

  /* ---------- work filters: re-pack rows so aspect ratios stay intact ---------- */
  const chips = document.querySelectorAll(".chip[data-f]");
  const pool = document.getElementById("pool");
  if (chips.length && pool) {
    const grid = document.querySelector(".rows.grid");
    const pack = (cells) => {
      const rows = []; let i = 0, k = 0;
      while (i < cells.length) {
        const want = k++ % 2 === 0 ? 2 : 1;
        const ar = parseFloat(cells[i].style.getPropertyValue("--ar"));
        if (want === 1 && ar >= 1.25) { rows.push(cells.slice(i, i + 1)); i += 1; }
        else { rows.push(cells.slice(i, i + 2)); i += 2; }
      }
      return rows;
    };
    chips.forEach((chip) => chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.toggle("on", c === chip));
      const f = chip.dataset.f;
      const cells = [...pool.content.cloneNode(true).children].filter((c) => f === "all" || c.dataset.cats.split(" ").includes(f));
      grid.classList.add("swap");
      setTimeout(() => {
        grid.innerHTML = "";
        for (const r of pack(cells)) {
          const row = document.createElement("div");
          row.className = "row" + (r.length === 1 ? " solo" : "");
          r.forEach((c) => { c.classList.add("in"); row.appendChild(c); });
          grid.appendChild(row);
        }
        grid.classList.remove("swap");
      }, 300);
    }));
  }

  /* ---------- lightbox ---------- */
  const lb = document.getElementById("lb");
  if (lb) {
    const items = [...document.querySelectorAll("[data-lb]")];
    const limg = lb.querySelector("img"), cap = lb.querySelector(".lb-cap");
    let cur = 0;
    const show = (i) => {
      cur = (i + items.length) % items.length;
      const a = items[cur], im = a.querySelector("img");
      limg.src = a.getAttribute("href"); limg.alt = im.alt; cap.textContent = im.alt;
    };
    const close = () => { lb.classList.remove("on"); lb.setAttribute("aria-hidden", "true"); scroll.locked = false; };
    items.forEach((a, i) => a.addEventListener("click", (ev) => {
      ev.preventDefault(); show(i); lb.classList.add("on"); lb.setAttribute("aria-hidden", "false"); scroll.locked = true;
    }));
    lb.addEventListener("click", (ev) => { if (ev.target === lb || ev.target.closest(".lb-x")) close(); else if (ev.target === limg) show(cur + 1); });
    addEventListener("keydown", (ev) => {
      if (!lb.classList.contains("on")) return;
      if (ev.key === "Escape") close();
      if (ev.key === "ArrowRight") show(cur + 1);
      if (ev.key === "ArrowLeft") show(cur - 1);
    });
  }

  /* ---------- copy email ---------- */
  const copyBtn = document.getElementById("copy");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(copyBtn.dataset.email); } catch (_) {}
    const lab = copyBtn.querySelector(".roll");
    const done = Object.assign(document.createElement("span"), { textContent: "Copied!" });
    lab.replaceWith(done);
    setTimeout(() => done.replaceWith(lab), 1600);
  });

  /* ---------- Fun: 3D infinite gallery ----------
     Images are packed into masonry lanes (shortest lane first); each lane repeats enough times
     to cover the tilted view and wraps by its own span, so the wall scrolls forever.
     Settings: 3 lanes (2 on phones), Work-grid gaps, drift 1.5px/frame, glide .95,
     perspective 1200, Tilt = rotateX 20° rotateY -15° rotateZ 5°. Tile heights follow each
     image's aspect ratio. */
  const funPool = document.getElementById("funPool");
  if (funPool) (() => {
    const g3 = funPool;
    const items = JSON.parse(document.getElementById("poolData").textContent);
    // category filter: the row under the Fun pill; #lettering etc. in the URL opens straight to one
    const sub = document.querySelector(".nv-sub");
    const cats = sub ? [...sub.querySelectorAll("[data-cat]")].map((b) => b.dataset.cat) : ["all"];
    let cat = cats.includes(location.hash.slice(1)) ? location.hash.slice(1) : "all";
    const inCat = (it) => (it.cats || ["all"]).includes(cat);
    // each category is shuffled once per visit so series don't clump together; kept for the visit
    // so resizing or coming back to a category doesn't reshuffle it
    const order = {};
    const shuffled = () => order[cat] || (order[cat] = (() => {
      const a = items.filter(inCat);
      for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    })());
    // a category with nothing yet shows its note instead (e.g. "AI projects will be added soon")
    const empty = document.createElement("p"); empty.className = "g3-empty"; empty.hidden = true; g3.appendChild(empty);
    const note = () => {
      const has = items.some(inCat), b = sub && sub.querySelector(`[data-cat="${cat}"]`);
      empty.hidden = has; empty.textContent = has ? "" : (b && b.dataset.empty) || "Nothing here yet";
    };
    const cam = g3.querySelector(".g3-cam"), wall = g3.querySelector(".g3-wall"), lanesEl = g3.querySelector(".g3-lanes");
    const views = {
      tilt: { depth: 1200, x: 20, y: -15, z: 5, zoom: 1 }, deck: { depth: 1200, x: 60, y: 0, z: 0, zoom: 1 },
      depth: { depth: 400, x: 0, y: 0, z: 0, zoom: 0.8 }, plain: { depth: 20000, x: 0, y: 0, z: 0, zoom: 1 },
      skew: { depth: 1200, x: 0, y: 0, z: 10, zoom: 0.95 }, turn: { depth: 1000, x: 0, y: 30, z: 0, zoom: 0.9 },
      sweep: { depth: 800, x: 0, y: -30, z: 0, zoom: 0.9 },
    };
    // how far above the frame the lanes must start, and how long they must run, to fill the tilted view
    const reach = (v, h) => {
      const half = h / 2; let r = half;
      if (v.x > 0) {
        const a = v.x * Math.PI / 180, d = v.zoom * (v.depth * Math.cos(a) - half * Math.sin(a));
        r = Math.min(d > 40 ? half * v.depth / d : h * 6, h * 6);
      }
      const top = Math.min(-half, half - r - 160);
      return { top, length: h - top + 160 };
    };
    let view = views[g3.dataset.view] ? g3.dataset.view : "tilt", lanes = [], cw = 0, chh = 0;
    const st = { pos: 0, aim: 0, holding: false };
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { root: g3, rootMargin: "200px 0px", threshold: 0.1 });

    const build = () => {
      cw = g3.clientWidth; chh = g3.clientHeight;
      // same rhythm as the Work grid: --gap between tiles, --g page margin at the sides
      const css = getComputedStyle(document.documentElement);
      const phone = cw < 810, n = phone ? 2 : 3;
      const gap = parseFloat(css.getPropertyValue("--gap")) || 5, side = parseFloat(css.getPropertyValue("--g")) || 20;
      const laneW = (cw - side * 2 - gap * (n - 1)) / n;
      const CAP = 0, LANE_GAP = gap;   // captions now float inside the image, so tiles sit a gap apart
      const packs = Array.from({ length: n }, () => ({ tiles: [], span: 0 }));
      shuffled().forEach((it, i) => {
        const h = laneW * it.h / it.w;
        let best = packs[0]; for (const p of packs) if (p.span < best.span) best = p;
        best.tiles.push({ it, i, h }); best.span += h + CAP + LANE_GAP;   // estimate; real span is measured below
      });
      // enough repeats for the longest view on offer (only those in the bar, or the default),
      // so switching views never rebuilds the wall but hidden views don't cost extra tiles
      const offered = [...g3.querySelectorAll(".g3-v")].map((b) => b.dataset.v).filter((k) => views[k]);
      const r = { length: Math.max(...(offered.length ? offered : [view]).map((k) => reach(views[k], chh).length)) };
      lanesEl.textContent = ""; io.disconnect(); lanes = [];
      packs.forEach((p) => {
        const copies = p.span > 0 ? Math.min(10, Math.max(2, Math.ceil(r.length / p.span) + 1)) : 2;
        const el = document.createElement("div"); el.className = "g3-lane";
        for (let c = 0; c < copies; c++) p.tiles.forEach((t) => {
          // image with its caption underneath; repeats are hidden from screen readers
          const b = document.createElement("figure"); b.className = "g3-t";
          if (c) b.setAttribute("aria-hidden", "true");
          const box = document.createElement("div"); box.className = "g3-img"; box.style.height = t.h + "px";
          const im = new Image(); im.alt = c ? "" : t.it.cap; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
          im.sizes = Math.ceil(laneW) + "px"; im.srcset = t.it.srcset; im.src = t.it.src;
          box.appendChild(im); b.appendChild(box);
          if (t.it.cap) {
            // caption pill (revealed on hover): series name, then the rest of the caption underneath
            const cap = document.createElement("figcaption"); cap.className = "g3-cap";
            const [head, ...rest] = t.it.cap.split(" — ");
            const h = document.createElement("span"); h.className = "g3-cap-t"; h.textContent = head; cap.appendChild(h);
            if (rest.length) { const r = document.createElement("span"); r.className = "g3-cap-s"; r.textContent = rest.join(" — "); cap.appendChild(r); }
            b.appendChild(cap);
          }
          el.appendChild(b); io.observe(b);
        });
        lanesEl.appendChild(el);
        // captions wrap differently per tile, so loop on the measured distance to the first repeat
        if (copies > 1 && p.tiles.length) p.span = el.children[p.tiles.length].offsetTop - el.children[0].offsetTop;
        // each lane drifts at its own pace (middle fastest) so the wall shears gently as it moves
        const pace = [0.8, 1.25, 1][lanes.length % 3];
        lanes.push({ el, span: p.span, pace });
      });
      setView(view);
      paint();
    };
    const setView = (k) => {
      view = k;
      const v = views[k];
      cam.style.perspective = v.depth + "px";
      wall.style.transform = `rotateX(${v.x}deg) rotateY(${v.y}deg) rotateZ(${v.z}deg) scale(${v.zoom})`;
      lanesEl.style.top = reach(v, chh).top + "px";
      g3.querySelectorAll(".g3-v").forEach((b) => { const on = b.dataset.v === k; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
    };
    const paint = () => { for (const l of lanes) { if (!(l.span > 0)) continue; const y = (((st.pos * l.pace) % l.span) + l.span) % l.span; l.el.style.transform = `translate3d(0, ${-y}px, 0)`; } };

    let prev = performance.now(), paused = false;
    const frame = (now) => {
      const dt = Math.min(64, now - prev) / 16.667; prev = now;
      if (!reduce && !st.holding && !paused) st.aim += 1.5 * dt;   // idle drift, px per 60fps frame
      const d = st.aim - st.pos;
      if (Math.abs(d) > 0.01) { st.pos += d * (reduce ? 1 : 1 - Math.pow(0.95, dt)); paint(); }
      requestAnimationFrame(frame);
    };

    g3.addEventListener("wheel", (ev) => { ev.preventDefault(); st.aim += ev.deltaY * (ev.deltaMode === 1 ? 40 : 1); }, { passive: false });
    let ty = 0;
    g3.addEventListener("touchstart", (ev) => { ty = ev.touches[0].clientY; st.holding = true; }, { passive: true });
    g3.addEventListener("touchmove", (ev) => { if (!st.holding) return; ev.preventDefault(); const y = ev.touches[0].clientY; st.aim += (ty - y) * 2; ty = y; }, { passive: false });
    const lift = () => { st.holding = false; };
    g3.addEventListener("touchend", lift); g3.addEventListener("touchcancel", lift);
    // mouse drag also moves the wall (as well as wheel / touch)
    let md = null;
    g3.addEventListener("pointerdown", (ev) => { if (ev.pointerType === "mouse" && ev.button === 0) md = { y: ev.clientY, moved: false }; });
    addEventListener("pointermove", (ev) => {
      if (!md) return;
      const dy = ev.clientY - md.y;
      if (!md.moved && Math.abs(dy) > 5) { md.moved = true; st.holding = true; g3.style.cursor = "grabbing"; }
      if (md.moved) { st.aim -= dy * 1.5; md.y = ev.clientY; }
    });
    addEventListener("pointerup", () => { if (md) { st.holding = false; g3.style.cursor = ""; setTimeout(() => { md = null; }, 0); } });

    // view switcher (arrow keys move between options, like a radio group)
    const bar = g3.querySelector(".g3-bar"), keys = [...g3.querySelectorAll(".g3-v")].map((b) => b.dataset.v);
    if (bar) bar.addEventListener("click", (ev) => { const b = ev.target.closest(".g3-v"); if (b && b.dataset.v !== view) setView(b.dataset.v); });
    if (bar) bar.addEventListener("keydown", (ev) => {
      const i = keys.indexOf(view), m = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 };
      if (!(ev.key in m)) return;
      ev.preventDefault();
      const k = keys[(m[ev.key] + keys.length) % keys.length];
      setView(k); bar.querySelector(`[data-v="${k}"]`).focus();
    });

    // a click anywhere on the wall pauses the drift so people can look; another click resumes it
    // (a drag is not a click; wheel / touch / drag still move the wall while paused)
    const hint = document.createElement("p"); hint.className = "g3-hint"; hint.setAttribute("aria-live", "polite");
    g3.appendChild(hint);
    g3.addEventListener("click", () => {
      if (md && md.moved) return;
      paused = !paused;
      g3.classList.toggle("paused", paused);
      hint.textContent = paused ? "Paused — click to resume" : "";
    });

    if (sub) {
      const mark = () => sub.querySelectorAll("[data-cat]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
      mark();
      sub.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-cat]");
        if (!b || b.dataset.cat === cat) return;
        cat = b.dataset.cat; mark();
        history.replaceState(null, "", cat === "all" ? location.pathname : "#" + cat);
        // quick fade out, swap the wall, fade back in from the top
        // (timed with setTimeout, not the animation's promise, so the swap always happens)
        lanesEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" });
        setTimeout(() => {
          st.pos = st.aim = 0; build(); note();
          lanesEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out", fill: "forwards" });
        }, 170);
      });
    }

    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 150); });
    build(); note();
    // captions may rewrap once Geist arrives, which changes the loop length: measure again then
    if (document.fonts) document.fonts.ready.then(() => { if (document.fonts.status === "loaded") build(); });
    requestAnimationFrame(frame);
  })();

  /* ---------- bottom-edge bend ----------
     A strip fixed to the bottom of the viewport re-draws what's behind it through an SVG
     displacement map like a band of curved glass: toward the bottom edge the view is magnified
     and bends outward to each side, the way a convex lens pulls what's behind it apart. Chromium supports SVG filters in backdrop-filter; other browsers
     simply show nothing extra. It fades out while the footer is being revealed. */
  // every page except the home page
  if (!reduce && !document.body.classList.contains("home") && CSS.supports("backdrop-filter", "url(#x)")) (() => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.innerHTML = `<filter id="edgeBend" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB" primitiveUnits="userSpaceOnUse">
      <feImage result="map" x="0" y="0" preserveAspectRatio="none"/>
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    document.body.appendChild(svg);
    const strip = document.createElement("div"); strip.className = "edge-bend"; strip.setAttribute("aria-hidden", "true");
    document.body.appendChild(strip);
    const feImg = svg.querySelector("feImage"), disp = svg.querySelector("feDisplacementMap");
    const c = document.createElement("canvas"), g = c.getContext("2d");
    const draw = () => {
      const w = Math.max(1, Math.round(strip.clientWidth)), h = Math.max(1, Math.round(strip.clientHeight));
      // Near the bottom edge content squashes toward the edge (curl) while bending outward to each side.
      // OUT = -1 bends outward (current), +1 pulls the corners inward; SQ = +1 squashes, -1 magnifies.
      const OUT = -1, SQ = 1;
      const pinch = 0.06, squash = 0.28;
      const maxX = (w / 2) * pinch, maxY = h * squash, S = 2 * Math.max(maxX, maxY) + 2;
      c.width = w; c.height = h;
      const im = g.createImageData(w, h), d = im.data;
      for (let y = 0; y < h; y++) {
        const t = y / (h - 1), k = t * t * (3 - 2 * t) * t;   // eased, strongest at the very bottom
        const dy = SQ * maxY * k;
        for (let x = 0; x < w; x++) {
          const dx = OUT * ((x - w / 2) / (w / 2)) * maxX * k, i = (y * w + x) * 4;
          d[i] = 128 + (dx / S) * 255; d[i + 1] = 128 + (dy / S) * 255; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      g.putImageData(im, 0, 0);
      feImg.setAttribute("href", c.toDataURL());
      feImg.setAttribute("width", w); feImg.setAttribute("height", h);
      disp.setAttribute("scale", S);
    };
    draw();
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  })();

  /* ---------- click burst: six short coloured strokes spring out from every click (not in the footer).
     Hidden extra: a triple click sets off fireworks all over the screen. ---------- */
  if (!reduce) {
    const COLORS = ["#ff4d2e", "#ffb800", "#2ecc71", "#18a0fb", "#8b5cf6", "#ff4fa3"];
    const burst = (x, y, size = 1) => {
      const b = document.createElement("div");
      b.className = "burst"; b.style.left = x + "px"; b.style.top = y + "px";
      const spin = Math.random() * 60, dur = 520 * (0.8 + size * 0.3);   // a little variety each time
      COLORS.forEach((c, i) => {
        const l = document.createElement("i");
        l.style.background = c;
        // stroke length grows with the burst (a bit faster than its spread, so big ones read as big),
        // centred on its pivot; thickness grows gently too
        const len = 10 * Math.pow(size, 1.35), wid = 3 + (size - 1) * 0.6;
        l.style.height = len + "px"; l.style.top = -len / 2 + "px";
        l.style.width = wid + "px"; l.style.left = -wid / 2 + "px"; l.style.borderRadius = wid / 2 + "px";
        b.appendChild(l);
        const a = spin + i * 60;
        l.animate([
          { transform: `rotate(${a}deg) translateY(${-5 * size}px) scaleY(.2)`, opacity: 1 },
          { transform: `rotate(${a}deg) translateY(${-14 * size}px) scaleY(1)`, opacity: 1, offset: .45 },
          { transform: `rotate(${a}deg) translateY(${-22 * size}px) scaleY(.1)`, opacity: 0 },
        ], { duration: dur, easing: "cubic-bezier(.2, .8, .3, 1)", fill: "forwards" });
      });
      document.body.appendChild(b);
      setTimeout(() => b.remove(), dur + 80);
    };
    // fireworks: ~36 bursts of mixed sizes scattered over the screen across ~1.4s (triple click, About hoop score)
    window.fireworks = () => {
      for (let n = 0; n < 36; n++) {
        setTimeout(() => burst(Math.random() * innerWidth, Math.random() * innerHeight, 1 + Math.random() * 2.2), n * 40 + Math.random() * 120);
      }
    };
    document.addEventListener("click", (ev) => {
      if (ev.target.closest && ev.target.closest("#foot")) return;
      if (!ev.clientX && !ev.clientY) return;   // keyboard "clicks" have no position
      if (ev.detail === 3) {
        getSelection()?.removeAllRanges();   // triple click would otherwise select a paragraph
        window.fireworks();
        return;
      }
      burst(ev.clientX, ev.clientY);
    });
  }

  /* ---------- Work cards: a "See project" button follows the cursor over a thumbnail, with an oval
     under the label flipping through that project's images. It lives inside the hovered thumbnail
     (so the thumbnail masks it at its edges) and glides after the cursor. ---------- */
  if (fine && document.querySelector(".works a.cell")) {
    const pill = document.createElement("div"); pill.className = "see-cta"; pill.setAttribute("aria-hidden", "true");
    pill.innerHTML = '<span class="see-l"><span>See project</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 11.5l7-7M6 4.5h5.5V10"/></svg></span><span class="see-o"><img alt=""></span>';
    const oval = pill.querySelector(".see-o img");
    const p = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let on = false, run = false, card = null, media = null, flip = 0, list = [], k = 0;
    const tick = () => {
      // glides after the cursor (eased follow)
      const prevX = p.x, prevY = p.y;
      p.x += (p.tx - p.x) * (reduce ? 1 : 0.22); p.y += (p.ty - p.y) * (reduce ? 1 : 0.22);
      p.vx = p.x - prevX; p.vy = p.y - prevY;
      if (media) {
        const r = media.getBoundingClientRect();
        pill.style.transform = `translate3d(${p.x - r.left}px, ${p.y - r.top}px, 0) translate(-50%, -50%)`;
      }
      if (on || Math.hypot(p.vx, p.vy) > 0.05 || Math.abs(p.tx - p.x) > 0.3 || Math.abs(p.ty - p.y) > 0.3) requestAnimationFrame(tick); else run = false;
    };
    const stopFlip = () => { clearInterval(flip); flip = 0; };
    const startFlip = (c) => {
      stopFlip();
      list = (c.dataset.peek || "").split(",").filter(Boolean);
      list.forEach((u) => { const im = new Image(); im.src = u; });   // warm them so the flip never blanks
      k = 0; if (list.length) oval.src = list[0];
      pill.classList.toggle("no-peek", !list.length);
      if (list.length > 1 && !reduce) flip = setInterval(() => { k = (k + 1) % list.length; oval.src = list[k]; }, 170);
    };
    const off = () => { on = false; pill.classList.remove("on"); stopFlip(); card = null; };
    let seen = false;   // has the mouse been over the page yet (so p.tx/p.ty are real)
    const hoverAt = (c) => {
      if (c && c !== card) {
        // move into the new thumbnail; arriving fresh, it starts at the cursor instead of flying in
        if (!on) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
        card = c; media = c.querySelector(".card-media"); media.appendChild(pill);
        startFlip(c); on = true; requestAnimationFrame(() => pill.classList.add("on"));
      } else if (!c && on) off();
      if (!run) { run = true; requestAnimationFrame(tick); }
    };
    document.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      p.tx = ev.clientX; p.ty = ev.clientY; seen = true;
      hoverAt(ev.target.closest && ev.target.closest(".works a.cell"));
    }, { passive: true });
    document.addEventListener("pointerleave", () => { seen = false; off(); });
    // scrolling moves thumbnails under a still cursor: hand the button to whichever one is there now
    addEventListener("scroll", () => {
      if (seen) hoverAt(document.elementFromPoint(p.tx, p.ty)?.closest(".works a.cell") || null);
    }, { passive: true });
  }

  /* ---------- prefetch pages on hover for instant transitions ---------- */
  const seen = new Set();
  document.addEventListener("pointerover", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[href^='/']");
    if (!a || seen.has(a.pathname) || a.pathname === location.pathname) return;
    seen.add(a.pathname);
    const l = document.createElement("link"); l.rel = "prefetch"; l.href = a.pathname; document.head.appendChild(l);
  });
})();

/* ---------- About: two line-drawn analog clocks (Pacific + India) drifting and bouncing off the viewport edges ---------- */
(() => {
  if (!document.body.classList.contains("about-pg")) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = 140;  // clock size, px
  const NS = "http://www.w3.org/2000/svg";
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = i * Math.PI / 6, r1 = i % 3 ? 41 : 38;
    return `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}"/>`;
  }).join("");
  const make = (tz, label) => {
    const el = document.createElement("div");
    el.className = "aclock"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<svg viewBox="0 0 100 100" xmlns="${NS}"><circle cx="50" cy="50" r="48"/>${ticks}
      <text x="50" y="66">${label}</text><text class="ap" x="50" y="76"></text>
      <line class="h" x1="50" y1="50" x2="50" y2="28"/><line class="m" x1="50" y1="50" x2="50" y2="15"/>
      <line class="s" x1="50" y1="56" x2="50" y2="12"/><circle class="c" cx="50" cy="50" r="1.6"/></svg>`;
    document.body.appendChild(el);
    const ang = Math.random() * Math.PI * 2, sp = 85;  // px / s
    return { el, tz, ap: el.querySelector(".ap"), h: el.querySelector(".h"), m: el.querySelector(".m"), s: el.querySelector(".s"),
      x: Math.random() * Math.max(1, innerWidth - S), y: 80 + Math.random() * Math.max(1, innerHeight - S - 80),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
  };
  const pt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "PT";
  const clocks = [make("America/Los_Angeles", pt), make("Asia/Kolkata", "IST")];

  // basketball hoop (side view): backboard edge + bracket, a rim, and a hanging diamond-mesh net
  // simulated as ropes (verlet, fixed 120Hz substeps, ropes only resist stretching) so a clock
  // dropping through pushes it out and it sways back. The backboard and the rim's two ends are
  // solid; a clock whose centre drops down through the rim scores. Score sits under the net.
  const hoop = document.createElement("div");
  hoop.className = "ahoop"; hoop.setAttribute("aria-hidden", "true");
  const HW = 270, RX = 100, RY = 13, CX = 128, RIM = 140, LEN = 125, ROWS = 8, COLS = 20, BX = 0;  // clamped straight onto the left wall
  hoop.innerHTML = `<svg viewBox="0 0 ${HW} 340" xmlns="${NS}">
    <path class="bracket" d="M${CX - RX + 2} ${RIM}H${BX}M${BX} ${RIM - 24}L${CX - RX - 8} ${RIM}"/>
    <path class="net back"/><path class="net front"/>
    <ellipse class="rim" cx="${CX}" cy="${RIM}" rx="${RX}" ry="${RY}"/>
    <text class="score" x="${CX}" y="306">0</text><text class="slabel" x="${CX}" y="326">SCORE</text></svg>`;
  document.body.appendChild(hoop);
  const scoreEl = hoop.querySelector(".score"), netBack = hoop.querySelector(".net.back"), netFront = hoop.querySelector(".net.front");
  const rest = (r, j) => {
    const t = r / ROWS, sh = 1 - 0.42 * t, th = (j / COLS) * Math.PI * 2;
    return [CX + RX * sh * Math.cos(th), RIM + LEN * t + RY * sh * Math.sin(th)];
  };
  const pts = [];
  for (let r = 0; r <= ROWS; r++) for (let j = 0; j < COLS; j++) {
    const [x, y] = rest(r, j); pts.push({ x, y, px: x, py: y, rx: x, ry: y, pin: r === 0, back: Math.sin((j / COLS) * Math.PI * 2) < 0 });
  }
  const P = (r, j) => pts[r * COLS + ((j % COLS) + COLS) % COLS];
  const links = [];
  for (let r = 0; r < ROWS; r++) for (let j = 0; j < COLS; j++) for (const dj of [1, -1]) {
    const a = P(r, j), b = P(r + 1, j + dj); links.push([a, b, Math.hypot(a.x - b.x, a.y - b.y), a.back && b.back]);
  }
  let score = 0, geo, k = 1, acc = 0;
  const measure = () => {
    const r = hoop.getBoundingClientRect(); k = r.width / HW;
    geo = { left: r.left, top: r.top, l: r.left + (CX - RX) * k, r: r.left + (CX + RX) * k, y: r.top + RIM * k };
  };
  // the hoop stays put on screen, centred on the left wall (it starts sliding along it at 5 points)
  let moving = false, phase = 0, lastTop = 0;
  const placeHoop = () => {
    if (!moving) hoop.style.top = Math.max(70, (innerHeight - hoop.getBoundingClientRect().height) / 2) + "px";
    measure();
  };
  placeHoop(); addEventListener("resize", placeHoop); addEventListener("load", placeHoop);
  document.fonts?.ready.then(placeHoop);
  const H = 1 / 120, G = 520 * H * H;   // substep, gravity per substep (hoop units)
  const sub = () => {
    for (const q of pts) {
      if (q.pin) continue;
      const vx = (q.x - q.px) * 0.985, vy = (q.y - q.py) * 0.985;
      q.px = q.x; q.py = q.y;
      q.x += vx + (q.rx - q.x) * 0.004; q.y += vy + G + (q.ry - q.y) * 0.004;   // gentle shape memory
    }
    for (const c of clocks) {   // clocks push the ropes softly out of their way
      const ccx = (c.x + S / 2 - geo.left) / k, ccy = (c.y + S / 2 - geo.top) / k, cr = R / k + 2;
      for (const q of pts) {
        if (q.pin) continue;
        const dx = q.x - ccx, dy = q.y - ccy, d = Math.hypot(dx, dy);
        if (d < cr && d > 0.001) { const m = (cr - d) / d * 0.45; q.x += dx * m; q.y += dy * m; }
      }
    }
    for (let it = 0; it < 6; it++) for (const [a, b, L] of links) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= L) continue;   // rope: goes slack when compressed, only pulls when stretched
      const m = (d - L) / d * (a.pin || b.pin ? 1 : 0.5);
      if (!a.pin) { a.x += dx * m; a.y += dy * m; }
      if (!b.pin) { b.x -= dx * m; b.y -= dy * m; }
    }
  };
  const netStep = (dt) => {
    measure();   // hoop may be sliding
    acc = Math.min(acc + dt, 0.1);
    while (acc >= H) { sub(); acc -= H; }
    let db = "", df = "";
    for (const [a, b, , back] of links) {
      const seg = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      if (back) db += seg; else df += seg;
    }
    netBack.setAttribute("d", db); netFront.setAttribute("d", df);
  };
  const scored = () => {
    score++; scoreEl.textContent = score;
    hoop.classList.remove("hit"); void hoop.offsetWidth; hoop.classList.add("hit");
    window.fireworks?.();
  };
  const fmt = (tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
  clocks.forEach((c) => { c.f = fmt(c.tz); });
  const setHands = () => {
    const now = new Date(), ms = now.getMilliseconds();
    for (const c of clocks) {
      const p = Object.fromEntries(c.f.formatToParts(now).map((x) => [x.type, +x.value]));
      const s = p.second + ms / 1000, m = p.minute + s / 60, h = (p.hour % 12) + m / 60;
      c.h.setAttribute("transform", `rotate(${h * 30} 50 50)`);
      c.m.setAttribute("transform", `rotate(${m * 6} 50 50)`);
      c.s.setAttribute("transform", `rotate(${Math.floor(s) * 6} 50 50)`);
      const ap = p.hour < 12 ? "AM" : "PM"; if (c.ap.textContent !== ap) c.ap.textContent = ap;
    }
  };
  const place = (c) => { c.el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`; };
  // cursor: position + smoothed velocity (px/s); a hit transfers the cursor's speed into the clock
  const BASE = 85, R = S * 0.48;  // cruising speed, clock face radius
  const ptr = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0 };
  addEventListener("pointermove", (e) => {
    const now = performance.now(), dt = Math.max(0.008, (now - ptr.t) / 1000);
    if (ptr.t && dt < 0.1) {
      const k = 0.5;  // smooth out jittery events
      ptr.vx += ((e.clientX - ptr.x) / dt - ptr.vx) * k; ptr.vy += ((e.clientY - ptr.y) / dt - ptr.vy) * k;
    } else { ptr.vx = ptr.vy = 0; }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = now;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { ptr.x = ptr.y = -1e4; });
  let last = performance.now();
  const step = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const W = innerWidth - S, H = innerHeight - S;
    if (t - ptr.t > 60) { ptr.vx *= Math.exp(-dt * 12); ptr.vy *= Math.exp(-dt * 12); }  // cursor at rest
    // 5+ points: the hoop slides up and down the left wall, a bit faster with every basket
    if (score >= 5) {
      const hh = hoop.getBoundingClientRect().height, lo = 70, hi = Math.max(lo + 1, innerHeight - hh - 16);
      const mid = (lo + hi) / 2, amp = (hi - lo) / 2;
      if (!moving) {
        moving = true;
        lastTop = hoop.getBoundingClientRect().top;
        phase = Math.asin(Math.max(-1, Math.min(1, (lastTop - mid) / amp)));
      }
      phase += Math.min(2.6, (2 * Math.PI / 6) * Math.pow(1.08, score - 5)) * dt;
      const top = mid + amp * Math.sin(phase), dy = (top - lastTop) / k;
      hoop.style.top = top + "px"; lastTop = top;
      // the net hangs back as the hoop moves (points keep their place in the world; the ropes drag them along)
      for (const q of pts) if (!q.pin) { q.y -= dy; q.py -= dy; }
    }
    const rimWas = geo.y; measure();
    for (const c of clocks) {
      // cursor touches the face: push the clock out and bounce it off the moving cursor (cursor = heavy body)
      const cx = c.x + S / 2, cy = c.y + S / 2, dx = cx - ptr.x, dy = cy - ptr.y, d = Math.hypot(dx, dy);
      if (d < R && d > 0.001) {
        const nx = dx / d, ny = dy / d;
        const rel = (ptr.vx - c.vx) * nx + (ptr.vy - c.vy) * ny;  // closing speed along the normal
        if (rel > 0) { c.vx += rel * 1.6 * nx; c.vy += rel * 1.6 * ny; }
        c.x += nx * (R - d); c.y += ny * (R - d);
      }
      // friction: any extra speed bleeds off until it's back to a slow drift
      let sp = Math.hypot(c.vx, c.vy);
      if (sp > 3000) { c.vx *= 3000 / sp; c.vy *= 3000 / sp; sp = 3000; }
      const target = BASE + (sp - BASE) * Math.exp(-dt * (sp > BASE ? 1.1 : 2));
      if (sp > 0.01) { c.vx *= target / sp; c.vy *= target / sp; }
      const py = c.y + S / 2;
      c.x += c.vx * dt; c.y += c.vy * dt;
      // hoop: rim ends and backboard are solid (closest point within the face radius -> bounce)
      const hx = c.x + S / 2, hy = c.y + S / 2;
      for (const [qx, qy] of [[geo.l, geo.y], [geo.r, geo.y]]) {
        const ex = hx - qx, ey = hy - qy, ed = Math.hypot(ex, ey);
        if (ed < R && ed > 0.001) {
          const nx = ex / ed, ny = ey / ed, vn = c.vx * nx + c.vy * ny;
          if (vn < 0) { c.vx -= 1.8 * vn * nx; c.vy -= 1.8 * vn * ny; }
          c.x += nx * (R - ed); c.y += ny * (R - ed);
        }
      }
      // basket: the centre drops through the rim line between its ends
      // (relative to the rim, which may be sliding: counts when the clock's centre goes from above it to below it)
      if (py < rimWas && c.y + S / 2 >= geo.y && hx > geo.l && hx < geo.r && !(c.cool > t)) {
        c.cool = t + 900; scored();
      }
      if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx); } else if (c.x > W) { c.x = W; c.vx = -Math.abs(c.vx); }
      if (c.y < 0) { c.y = 0; c.vy = Math.abs(c.vy); } else if (c.y > H) { c.y = H; c.vy = -Math.abs(c.vy); }
    }
    // the two clocks bounce off each other too (equal-mass elastic hit along the line between centres)
    const [a, b] = clocks, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < S) {
      const nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) { a.vx -= rel * nx; a.vy -= rel * ny; b.vx += rel * nx; b.vy += rel * ny; }
      const push = (S - d) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
    // passing through the net soaks up some speed
    for (const c of clocks) {
      const hx = c.x + S / 2, hy = c.y + S / 2, t2 = (hy - geo.y) / (LEN * k);
      if (t2 > 0 && t2 < 1 && Math.abs(hx - (geo.l + geo.r) / 2) < RX * k * (1 - 0.42 * t2)) { const dmp = Math.exp(-dt * 2.5); c.vx *= dmp; c.vy *= dmp; }
    }
    netStep(dt);
    clocks.forEach(place);
    setHands();
    requestAnimationFrame(step);
  };
  setHands(); clocks.forEach(place); netStep(0.016);
  if (reduce) { setInterval(setHands, 1000); return; }
  requestAnimationFrame(step);
})();
