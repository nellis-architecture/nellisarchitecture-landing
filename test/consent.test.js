const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'consent.js'), 'utf8');

/* Runs js/consent.js in a fake browser with the given timezone and stored choice. */
function load(timeZone, storedChoice = null) {
  const store = new Map(storedChoice ? [['nellis-consent', storedChoice]] : []);
  const gtagCalls = [];
  const appended = [];
  const listeners = {};
  const el = () => {
    const node = {
      hidden: false,
      attrs: {},
      setAttribute(k, v) {
        node.attrs[k] = v;
      },
      addEventListener(t, fn) {
        node.click = fn;
      },
    };
    return node;
  };
  const window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    gtag: (...args) => gtagCalls.push(args),
  };
  const document = {
    createElement: el,
    body: { appendChild: (n) => appended.push(n) },
    addEventListener: (t, fn) => {
      listeners[t] = fn;
    },
  };
  const Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) };
  vm.runInNewContext(SRC, { window, document, Intl });
  return {
    window, store, gtagCalls, appended, listeners,
  };
}

test('inRegion: EEA, UK and Swiss timezones, also the islands; not Dubai or New York', () => {
  const { inRegion } = load('Asia/Dubai').window.NellisConsent;
  ['Europe/Berlin', 'Europe/London', 'Europe/Zurich', 'Europe/Dublin', 'Atlantic/Canary',
    'Atlantic/Madeira', 'Atlantic/Azores', 'Atlantic/Reykjavik', 'Arctic/Longyearbyen',
    'Africa/Ceuta', 'Asia/Nicosia', 'Asia/Famagusta'].forEach((tz) => assert.ok(inRegion(tz), tz));
  ['Asia/Dubai', 'America/New_York', 'Asia/Kolkata', 'Atlantic/Bermuda', 'Asia/Famagusta2', '',
    undefined].forEach((tz) => assert.ok(!inRegion(tz), String(tz)));
});

test('the banner shows in the region only when no choice is stored', () => {
  assert.equal(load('Europe/Paris').appended.length, 1);
  assert.equal(load('Europe/Paris', 'denied').appended.length, 0);
  assert.equal(load('Asia/Dubai').appended.length, 0);
});

test('a choice is stored and sent to gtag; Cookie settings shows the banner again', () => {
  const s = load('Europe/Paris');
  const [banner] = s.appended;
  banner.click({ target: { closest: () => ({ getAttribute: () => 'denied' }) } });
  assert.equal(s.store.get('nellis-consent'), 'denied');
  const update = JSON.stringify([['consent', 'update', { analytics_storage: 'denied' }]]);
  assert.equal(JSON.stringify(s.gtagCalls), update);
  assert.equal(banner.hidden, true);
  let prevented = false;
  s.listeners.click({
    target: { closest: (sel) => (sel === '.cookieSettings' ? {} : null) },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.ok(prevented);
  assert.equal(banner.hidden, false);
  assert.equal(s.appended.length, 1, 'the same banner, not a second one');
});

test('every page has one GA snippet: consent default before config, the site_build marker', () => {
  const pages = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')
    .match(/<loc>[^<]+<\/loc>/g)
    .map((loc) => loc.replace(/<\/?loc>/g, '').replace('https://nellisarchitecture.com/', ''))
    .map((p) => path.join(ROOT, p, 'index.html'));
  assert.ok(pages.length > 100);
  pages.forEach((file) => {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(html.split('googletagmanager.com/gtag/js?id=G-5D57DNBBLX').length - 1, 1, file);
    assert.equal(html.split('<script src="/js/consent.js" defer></script>').length - 1, 1, file);
    const at = (s) => html.indexOf(s);
    assert.ok(at("gtag('consent', 'default'") > -1, file);
    assert.ok(at("gtag('consent', 'default'") < at("gtag('config'"), file);
    assert.ok(html.includes("gtag('config', 'G-5D57DNBBLX', { site_build: 'static' });"), file);
  });
});
