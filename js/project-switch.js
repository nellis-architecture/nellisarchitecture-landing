/* global Swiper */
/* Project pages: a thumb click swaps the open project in place, as on the live site.
   On desktop the new project slides in from the right on .currentProject2 (theme CSS). */
(function projectSwitch() {
  'use strict';

  const PROJECT_PATH = /^\/projects\/[^/]+\/[^/]+\/$/;
  const HEAD_TAGS = ['meta[name="description"]', 'link[rel="canonical"]',
    'meta[property^="og:"]', 'script.yoast-schema-graph'];
  /* A copy of the theme swiper.js options (keep in step), for a page with no theme slider. */
  const SWIPER_OPTIONS = {
    slidesPerView: 'auto',
    speed: 1000,
    spaceBetween: 20,
    breakpoints: { 1179: { spaceBetween: 30 } },
    lazy: { loadPrevNext: true },
    navigation: { nextEl: '.btnn', prevEl: '.btnp' },
    pagination: { el: '.swiper-paginationCust', type: 'fraction' },
  };
  const parser = new DOMParser();
  const cache = new Map();
  const overlay = document.querySelector('.currentProject2');
  let current = window.location.pathname;
  let latest = 0;
  let options = null;
  let timer = 0;

  // Taken before the footer scripts change the page (img-protect wraps the images).
  cache.set(current, parser.parseFromString(document.documentElement.outerHTML, 'text/html'));

  function swiperOptions() {
    const theme = document.querySelector('.currentProject2 .swiper');
    if (!theme || !theme.swiper) return SWIPER_OPTIONS;
    const params = { ...theme.swiper.passedParams };
    delete params.el;
    return params;
  }

  function fill(panel, doc) {
    const foot = panel.querySelector('.footer.mobFoot');
    const next = doc.querySelector('.currentProject');
    const nextFoot = next.querySelector('.footer.mobFoot');
    if (!options) options = swiperOptions();
    panel.querySelectorAll('.swiper').forEach((el) => el.swiper && el.swiper.destroy(true, true));
    while (panel.firstChild !== foot) panel.removeChild(panel.firstChild);
    for (let n = next.firstChild; n && n !== nextFoot; n = n.nextSibling) {
      panel.insertBefore(document.importNode(n, true), foot);
    }
    const video = panel.querySelector('.currentProject-heroImg video');
    if (video) {
      video.muted = video.defaultMuted;
      video.play().catch(() => {});
    }
  }

  function swapPanel(doc) {
    const panel = document.querySelector('.currentProject');
    fill(panel, doc);
    panel.querySelectorAll('.swiper').forEach((el) => new Swiper(el, options));
    panel.scrollTop = 0;
  }

  function snapBack() {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    overlay.classList.add('curTransition');
    overlay.classList.remove('currentRight');
    overlay.getBoundingClientRect();
    overlay.classList.remove('curTransition');
    overlay.replaceChildren();
  }

  function slide(doc) {
    snapBack();
    fill(overlay, doc);
    overlay.getBoundingClientRect();
    overlay.classList.add('currentRight');
    timer = setTimeout(() => {
      swapPanel(doc);
      snapBack();
    }, 800);
  }

  function swapHead(doc) {
    document.title = doc.title;
    HEAD_TAGS.forEach((sel) => {
      const old = document.querySelectorAll(sel);
      doc.querySelectorAll(sel).forEach((n) => {
        if (old[0]) old[0].parentNode.insertBefore(document.importNode(n, true), old[0]);
        else document.head.appendChild(document.importNode(n, true));
      });
      old.forEach((n) => n.remove());
    });
    const h1 = 'h1.visually-hidden';
    document.querySelector(h1).textContent = doc.querySelector(h1).textContent;
  }

  function load(path) {
    if (cache.has(path)) return Promise.resolve(cache.get(path));
    return fetch(path).then((res) => {
      if (!res.ok || res.redirected) throw new Error(`${path}: ${res.status}`);
      return res.text();
    }).then((html) => {
      const doc = parser.parseFromString(html, 'text/html');
      if (!doc.querySelector('.currentProject')) throw new Error(`${path}: no project`);
      cache.set(path, doc);
      return doc;
    });
  }

  function show(path, push) {
    latest += 1;
    const mine = latest;
    load(path).then((doc) => {
      if (mine !== latest) return;
      if (push && window.matchMedia('(min-width: 1180px)').matches) slide(doc);
      else {
        snapBack();
        swapPanel(doc);
      }
      swapHead(doc);
      if (push) window.history.pushState(null, '', path);
      current = path;
      document.dispatchEvent(new Event('nellis:projectswitch'));
    }, () => {
      if (mine !== latest) return;
      if (push) window.location.assign(path);
      else window.location.reload();
    });
  }

  document.querySelector('.center .container').addEventListener('click', (e) => {
    const link = e.target.closest('a.project__link');
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
      || !link) return;
    e.preventDefault();
    const path = new URL(link.getAttribute('href'), window.location.href).pathname;
    if (path !== current) show(path, true);
  });

  // A sidebar menu click opens the first project of the new list (index-projects.html).
  document.addEventListener('nellis:filterpick', (e) => {
    if (!e.detail.href) return;
    const path = new URL(e.detail.href, window.location.href).pathname;
    if (path !== current) show(path, true);
  });

  window.addEventListener('popstate', () => {
    const path = window.location.pathname;
    if (path === current) return;
    if (PROJECT_PATH.test(path)) show(path, false);
    else window.location.reload();
  });
}());
