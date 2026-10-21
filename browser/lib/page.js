/* Shared browser-test helper: one connection to the browser server of run.js
   (NELLIS_WS, engine NELLIS_ENGINE), pages at NELLIS_BASE, API and Turnstile
   stubs, error collection, the horizontal-overflow check and failure
   screenshots (NELLIS_SHOTS). */
const assert = require('node:assert/strict');
const { after } = require('node:test');
const path = require('node:path');
const { chromium, webkit } = require('playwright-core');

const ENGINES = { chromium, webkit };

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const BASE = process.env.NELLIS_BASE || 'http://localhost:8000';
const SHOTS = process.env.NELLIS_SHOTS || '';

const TURNSTILE_SHIM = `
window.turnstile = (function () {
  var widgets = {};
  var next = 0;
  return {
    render: function (el, options) { next += 1; widgets[next] = options; return String(next); },
    execute: function (id) {
      var options = widgets[id];
      if (options && options.callback) {
        setTimeout(function () { options.callback('test-token'); }, 0);
      }
    },
    reset: function () {},
  };
}());
`;

const json = (data) => ({
  status: 200, contentType: 'application/json', body: JSON.stringify(data),
});

/* The Worker's answers, without the Worker. Records each /api/* call in apiCalls. */
function answerApi(route, request, apiCalls) {
  const url = new URL(request.url());
  apiCalls.push(`${request.method()} ${url.pathname}`);
  if (request.method() === 'PUT' && url.pathname.startsWith('/api/upload/')) {
    return route.fulfill({ status: 201, body: '' });
  }
  if (request.method() === 'POST' && /^\/api\/message\/[^/]+\/send$/.test(url.pathname)) {
    return route.fulfill(json({ ok: true }));
  }
  if (request.method() === 'POST' && url.pathname === '/api/message') {
    const body = request.postData() || '';
    const files = body.match(/name="files"\r\n\r\n([^\r\n]+)/);
    if (!files) return route.fulfill(json({ ok: true }));
    const manifest = JSON.parse(files[1]);
    const uploads = manifest.map((file, i) => ({
      name: file.name, url: `${BASE}/api/upload/key${i}?exp=1&sig=s`,
    }));
    return route.fulfill(json({
      id: 'test-message', exp: 1, sendSig: 's', uploads,
    }));
  }
  return route.fulfill(json({ ok: true }));
}

let shared = null;
function connect() {
  if (!shared) {
    const engine = ENGINES[process.env.NELLIS_ENGINE] || chromium;
    shared = engine.connect(process.env.NELLIS_WS);
  }
  return shared;
}

/* launchServer gives each connection its own browser: close ours so the
   test-file process can exit. */
after(async () => {
  if (shared) (await shared).close();
});

/* Opens BASE + pathname in a new context with the given viewport. */
async function visit(pathname, viewport = DESKTOP) {
  const browser = await connect();
  const context = await browser.newContext({ viewport });
  const apiCalls = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'challenges.cloudflare.com') {
      return route.fulfill({
        status: 200, contentType: 'application/javascript', body: TURNSTILE_SHIM,
      });
    }
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.startsWith('/api/')) return answerApi(route, request, apiCalls);
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const from = msg.location().url || '';
    if (from && !from.startsWith(BASE)) return; // stubbed external, for example GA
    /* Known site bug, reported: main.css has url("../img/newN.png'?>") — a leftover
       PHP tag — so /studio/ and /people/ 404 the .nd1/.nd2 decor images. */
    if (/%3E$/.test(from) && /new\d\.png/.test(from)) return;
    /* The speculationrules block in footer.html prefetches every same-origin link.
       WebKit denies that prefetch over plain http; Chromium allows it on localhost.
       The live site is HTTPS, so this is local. */
    if (msg.text() === 'Prefetch request denied: URL must be secure (HTTPS)') return;
    errors.push(`console: ${msg.text()}`);
  });
  await page.goto(BASE + pathname, { waitUntil: 'domcontentloaded' });
  return {
    page,
    context,
    errors,
    apiCalls,
    close: () => context.close(),
    shot: (name) => (SHOTS
      ? page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {})
      : Promise.resolve()),
  };
}

/* No page errors, no console errors, no horizontal overflow. */
async function assertClean(v) {
  assert.deepEqual(v.errors, []);
  const size = await v.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  assert.ok(
    size.scroll <= size.inner,
    `horizontal overflow: scrollWidth ${size.scroll} > innerWidth ${size.inner}`,
  );
}

/* Wraps a test body: a failure saves a screenshot, the context always closes. */
async function check(v, name, fn) {
  try {
    await fn();
    await assertClean(v);
  } catch (error) {
    await v.shot(name);
    throw error;
  } finally {
    await v.close();
  }
}

/* Polls a Node-side predicate (route stubs update apiCalls asynchronously). */
function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  const spin = () => Promise.resolve().then(fn).then((ok) => {
    if (ok) return true;
    if (Date.now() > end) throw new Error('until: timeout');
    return new Promise((resolve) => {
      setTimeout(resolve, 50);
    }).then(spin);
  });
  return spin();
}

async function fillContact(page, form) {
  await page.fill(`${form} [name="name"]`, 'Browser Test');
  await page.fill(`${form} [name="email"]`, 'browser@test.example');
  await page.fill(`${form} [name="phone"]`, '+971 50 000 0000');
  await page.fill(`${form} [name="massage"]`, 'A message from the browser test.');
}

async function openBrief(page) {
  await page.locator('.popup2:visible').first().click();
  await page.waitForSelector('.modalBG2.modalOpen');
}

module.exports = {
  DESKTOP, MOBILE, BASE, visit, assertClean, check, until, fillContact, openBrief,
};
