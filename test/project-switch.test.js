const {
  test, beforeEach, afterEach, mock,
} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'project-switch.js'), 'utf8');
const DOMAIN = 'https://nellisarchitecture.com';
const ZEPHYR = '/projects/architecture/zephyr/';
const W44 = '/projects/architecture/w44/';
const ATHENA = '/projects/architecture/athena/';

/* A minimal DOM: tag, classes, [attr="v"], [attr^="v"], descendant and comma selectors. */
function matchOne(el, sel) {
  const [, tag, cls, attrs] = sel.match(/^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  const have = el.className.split(' ');
  if (cls.split('.').filter(Boolean).some((c) => !have.includes(c))) return false;
  return [...attrs.matchAll(/\[([\w-]+)(\^?=)"([^"]*)"\]/g)].every(([, name, op, v]) => {
    const a = el.getAttribute(name);
    return a !== null && (op === '=' ? a === v : a.startsWith(v));
  });
}

function matchChain(el, parts) {
  if (!el.tagName || !matchOne(el, parts[parts.length - 1])) return false;
  if (parts.length === 1) return true;
  for (let a = el.parentNode; a; a = a.parentNode) {
    if (matchChain(a, parts.slice(0, -1))) return true;
  }
  return false;
}

class El {
  constructor(tag, attrs = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.text = text;
    this.childNodes = [];
    this.parentNode = null;
    this.on = {};
    this.scrollTop = 0;
    this.reflows = 0;
    children.forEach((c) => this.appendChild(c));
  }

  get className() {
    return this.attrs.class || '';
  }

  get classList() {
    const set = (list) => {
      this.attrs.class = list.join(' ');
    };
    const list = () => this.className.split(' ').filter(Boolean);
    return {
      contains: (c) => list().includes(c),
      add: (c) => set([...list().filter((x) => x !== c), c]),
      remove: (c) => set(list().filter((x) => x !== c)),
    };
  }

  getBoundingClientRect() {
    this.reflows += 1;
    return {};
  }

  replaceChildren() {
    [...this.childNodes].forEach((c) => this.removeChild(c));
  }

  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get nextSibling() {
    const sibs = this.parentNode.childNodes;
    return sibs[sibs.indexOf(this) + 1] || null;
  }

  get textContent() {
    return this.text;
  }

  set textContent(v) {
    this.text = v;
  }

  appendChild(n) {
    return this.insertBefore(n, null);
  }

  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode.removeChild(n);
    const at = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(at, 0, n);
    return Object.assign(n, { parentNode: this });
  }

  removeChild(n) {
    this.childNodes.splice(this.childNodes.indexOf(n), 1);
    return Object.assign(n, { parentNode: null });
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  all() {
    return this.childNodes.flatMap((c) => [c, ...c.all()]);
  }

  matches(sel) {
    return sel.split(',').some((s) => matchChain(this, s.trim().split(/\s+/)));
  }

  closest(sel) {
    for (let n = this; n; n = n.parentNode) if (n.matches(sel)) return n;
    return null;
  }

  querySelectorAll(sel) {
    return this.all().filter((n) => n.matches(sel));
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  addEventListener(type, fn) {
    this.on[type] = fn;
  }

  get defaultMuted() {
    return 'muted' in this.attrs;
  }

  play() {
    this.played = true;
    this.playedMuted = this.muted === true;
    return Promise.resolve();
  }

  clone() {
    const c = new El(this.tagName, this.attrs, this.childNodes.map((k) => k.clone()), this.text);
    c.from = this;
    return c;
  }
}

const slug = (p) => p.split('/')[3];

function build(p, panel = true) {
  const name = slug(p);
  const head = new El('head', {}, [
    new El('title', {}, [], `${name} | Nellis`),
    new El('meta', { name: 'description', content: `about ${name}` }),
    new El('link', { rel: 'canonical', href: DOMAIN + p }),
    new El('meta', { property: 'og:title', content: name }),
    ...(name === 'zephyr' ? [] : [
      new El('meta', { property: 'og:image', content: `${DOMAIN}/${name}.jpg` }),
    ]),
    new El('script', { class: 'yoast-schema-graph' }, [], `{"name":"${name}"}`),
  ]);
  const thumbs = [ZEPHYR, W44, ATHENA].map((href) => new El('div', { class: 'project__item' }, [
    new El('a', { class: 'project__link no-prefetch', href }, [new El('span')]),
  ]));
  const hero = name === 'zephyr' ? new El('video', { autoplay: '', muted: '' }) : new El('img');
  const body = new El('body', {}, [
    new El('h1', { class: 'visually-hidden' }, [], name),
    new El('div', { class: 'center centerMini' }, [new El('div', { class: 'container' }, thumbs)]),
    ...(panel ? [new El('div', { class: 'currentProject project__openned' }, [
      new El('nav', { class: 'projectBreadcrumbs' }, [], name),
      new El('div', { class: 'currentProject-heroImg' }, [hero]),
      new El('div', { class: 'swiper' }, [], name),
      new El('div', { class: 'footer mobFoot' }),
    ])] : []),
    new El('div', { class: 'currentProject2' }, [
      new El('div', { class: 'swiper' }),
      new El('div', { class: 'footer mobFoot' }),
    ]),
  ]);
  return new El('html', {}, [head, body]);
}

function makeDoc(root, log) {
  const [head, body] = root.childNodes;
  const title = root.querySelector('title');
  return {
    documentElement: root,
    head,
    body,
    on: {},
    get title() {
      return title.text;
    },
    set title(v) {
      log.push(['title', v]);
      title.text = v;
    },
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    importNode: (n) => n.clone(),
    addEventListener(type, fn) {
      this.on[type] = fn;
    },
    dispatchEvent(ev) {
      log.push(['event', ev.type]);
    },
  };
}

const flush = () => new Promise((resolve) => {
  setImmediate(resolve);
});
const page = (p) => ({ ok: true, redirected: false, text: () => Promise.resolve(`PAGE:${p}`) });

function load(start = ZEPHYR, wide = true) {
  const log = [];
  const root = build(start);
  Object.assign(root, { outerHTML: `PAGE:${start}` });
  const document = makeDoc(root, log);
  const swipers = { created: [], destroyed: [] };
  function Swiper(el, params) {
    this.el = el;
    this.passedParams = params;
    Object.assign(el, { swiper: this });
    swipers.created.push(this);
  }
  Swiper.prototype.destroy = function destroy(a, b) {
    swipers.destroyed.push([this.el, a, b]);
    delete this.el.swiper;
  };
  document.querySelectorAll('.swiper').forEach((el) => new Swiper(el, { speed: 1000, el }));
  swipers.created.length = 0;
  const parsed = [];
  const fetched = [];
  const h = { reply: (url) => Promise.resolve(page(url)) };
  const location = {
    pathname: start,
    get href() {
      return DOMAIN + this.pathname;
    },
    assign: (p) => log.push(['assign', p]),
    reload: () => log.push(['reload']),
  };
  const history = {
    pushState: (s, t, p) => {
      log.push(['push', p]);
      location.pathname = p;
    },
  };
  function Event(type) {
    this.type = type;
  }
  function DOMParser() {}
  DOMParser.prototype.parseFromString = (html) => {
    const [kind, p] = html.split(':');
    const doc = makeDoc(build(p, kind === 'PAGE'), log);
    parsed.push(doc);
    return doc;
  };
  const window = {
    location,
    history,
    on: {},
    addEventListener(type, fn) {
      this.on[type] = fn;
    },
    matchMedia: (q) => ({ matches: wide && q === '(min-width: 1180px)' }),
  };
  const ctx = {
    window,
    document,
    URL,
    Swiper,
    Event,
    DOMParser,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    fetch: (url) => {
      fetched.push(url);
      return h.reply(url);
    },
  };
  vm.runInNewContext(SRC, ctx);
  const container = document.querySelector('.center .container');
  const click = (href, mods = {}) => {
    const link = container.querySelectorAll('a.project__link').find((a) => a.attrs.href === href);
    const ev = {
      target: link.firstChild,
      button: 0,
      defaultPrevented: false,
      ...mods,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    container.on.click(ev);
    return ev;
  };
  const back = (p) => {
    location.pathname = p;
    window.on.popstate({});
  };
  const panel = () => document.querySelector('.currentProject');
  const shown = () => panel().querySelector('.projectBreadcrumbs').text;
  const overlay = () => document.querySelector('.currentProject2');
  /* The browser fires transitionstart when the slide begins to move. */
  const moves = () => overlay().on.transitionstart({ target: overlay(), propertyName: 'right' });
  return {
    log, document, swipers, parsed, fetched, h, location, click, back, panel, shown, overlay, moves,
  };
}

/* eslint-disable n/no-unsupported-features/node-builtins -- mock.timers is stable from Node 23.1;
   the tests run on Node 24 */
const tick = (ms = 1600) => mock.timers.tick(ms);

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());
/* eslint-enable n/no-unsupported-features/node-builtins */

test('a thumb click swaps the open project in place', async () => {
  const s = load();
  const foot = s.panel().querySelector('.footer.mobFoot');
  s.panel().scrollTop = 500;
  const ev = s.click(W44);
  await flush();
  tick();
  assert.ok(ev.defaultPrevented);
  assert.deepEqual(s.fetched, [W44]);
  assert.equal(s.shown(), 'w44');
  assert.equal(s.panel().scrollTop, 0);
  assert.equal(s.panel().querySelector('.footer.mobFoot'), foot, 'the live mobile footer stays');
  assert.equal(s.panel().childNodes.length, 4);
  assert.equal(s.panel().childNodes[3], foot);
  const cached = s.parsed[1].querySelector('.currentProject');
  assert.equal(cached.childNodes.length, 4, 'the cached page keeps its panel');
  s.panel().childNodes.slice(0, 3).forEach((n, i) => assert.equal(n.from, cached.childNodes[i]));
  assert.deepEqual(s.log, [
    ['title', 'w44 | Nellis'], ['push', W44], ['event', 'nellis:projectswitch'],
  ]);
});

test('the head and the h1 follow the open project', async () => {
  const s = load();
  const d = s.document;
  const og = () => d.querySelectorAll('meta[property^="og:"]').map((m) => m.attrs.content);
  assert.deepEqual(og(), ['zephyr']);
  s.click(W44);
  await flush();
  assert.equal(d.title, 'w44 | Nellis');
  assert.equal(d.querySelector('meta[name="description"]').attrs.content, 'about w44');
  assert.equal(d.querySelectorAll('meta[name="description"]').length, 1);
  assert.equal(d.querySelector('link[rel="canonical"]').attrs.href, DOMAIN + W44);
  assert.deepEqual(og(), ['w44', `${DOMAIN}/w44.jpg`]);
  const schema = d.querySelectorAll('script.yoast-schema-graph').map((x) => x.text);
  assert.deepEqual(schema, ['{"name":"w44"}']);
  assert.equal(d.querySelector('h1.visually-hidden').text, 'w44');
  s.back(ZEPHYR);
  await flush();
  assert.deepEqual(og(), ['zephyr'], 'og:image goes away');
  assert.equal(d.querySelector('link[rel="canonical"]').attrs.href, DOMAIN + ZEPHYR);
  assert.equal(d.head.childNodes.length, 5);
});

test('modifier clicks, other buttons and handled clicks stay native', async () => {
  const mods = [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true },
    { button: 1 }, { defaultPrevented: true }];
  await Promise.all(mods.map(async (m) => {
    const s = load();
    const ev = s.click(W44, m);
    await flush();
    assert.equal(ev.defaultPrevented, Boolean(m.defaultPrevented), JSON.stringify(m));
    assert.deepEqual(s.fetched, []);
    assert.deepEqual(s.log, []);
  }));
});

test('a click outside a project link is ignored', () => {
  const s = load();
  const container = s.document.querySelector('.center .container');
  container.on.click({ target: container, button: 0, preventDefault: assert.fail });
  assert.deepEqual(s.fetched, []);
});

test('the own thumb does nothing', async () => {
  const s = load();
  const ev = s.click(ZEPHYR);
  await flush();
  assert.ok(ev.defaultPrevented);
  assert.deepEqual(s.fetched, []);
  assert.deepEqual(s.log, []);
});

test('a failed load opens the page normally', async () => {
  const fails = [
    () => Promise.reject(new Error('offline')),
    () => Promise.resolve({ ...page(W44), ok: false }),
    () => Promise.resolve({ ...page(W44), redirected: true }),
    () => Promise.resolve({ ...page(W44), text: () => Promise.resolve(`NOPANEL:${W44}`) }),
  ];
  await Promise.all(fails.map(async (fail) => {
    const s = load();
    s.h.reply = fail;
    s.click(W44);
    await flush();
    assert.deepEqual(s.log, [['assign', W44]]);
    assert.equal(s.shown(), 'zephyr');
  }));
});

test('only the latest click wins', async () => {
  const s = load();
  const pending = {};
  s.h.reply = (url) => new Promise((resolve) => {
    pending[url] = () => resolve(page(url));
  });
  s.click(W44);
  s.click(ATHENA);
  pending[ATHENA]();
  await flush();
  pending[W44]();
  await flush();
  tick();
  assert.equal(s.shown(), 'athena');
  assert.deepEqual(s.log.filter(([k]) => k === 'push'), [['push', ATHENA]]);
});

test('Back and Forward swap in place without a new history entry', async () => {
  const s = load();
  s.click(W44);
  await flush();
  tick();
  s.log.length = 0;
  s.back(ZEPHYR);
  await flush();
  assert.equal(s.shown(), 'zephyr');
  assert.deepEqual(s.fetched, [W44], 'the first page comes from the cache');
  assert.deepEqual(s.log, [['title', 'zephyr | Nellis'], ['event', 'nellis:projectswitch']]);
  const video = s.panel().querySelector('video');
  assert.ok(video.played, 'the hero video plays');
  assert.ok(video.playedMuted, 'a cloned video keeps its muted attribute as state');
  s.back(W44);
  await flush();
  assert.equal(s.shown(), 'w44');
  assert.deepEqual(s.fetched, [W44]);
});

test('popstate: a hash change is ignored, another page reloads', async () => {
  const s = load();
  s.back(ZEPHYR);
  await flush();
  assert.deepEqual(s.log, []);
  s.back('/studio/');
  await flush();
  assert.deepEqual(s.log, [['reload']]);
  assert.deepEqual(s.fetched, []);
});

test('popstate: a failed load reloads the page', async () => {
  const s = load();
  s.h.reply = () => Promise.reject(new Error('offline'));
  s.back(W44);
  await flush();
  assert.deepEqual(s.log, [['reload']]);
});

test('the gallery sliders are destroyed and made again with the theme options', async () => {
  const s = load();
  const old = s.panel().querySelector('.swiper');
  const theme = s.document.querySelector('.currentProject2 .swiper');
  s.click(W44);
  await flush();
  tick();
  const gone = 'the theme slider goes with the first slide';
  assert.deepEqual(s.swipers.destroyed, [[theme, true, true], [old, true, true]], gone);
  const fresh = s.panel().querySelector('.swiper');
  assert.equal(s.swipers.created.length, 1);
  assert.equal(s.swipers.created[0].el, fresh);
  assert.equal(fresh.swiper, s.swipers.created[0]);
  const params = s.swipers.created[0].passedParams;
  assert.equal(params.speed, 1000);
  assert.equal(params.el, undefined, 'not the theme slider element');
  assert.equal(s.overlay().querySelector('.swiper'), null, 'the overlay is empty');
});

test('a menu pick of another project switches to it', async () => {
  const s = load();
  s.panel().scrollTop = 600;
  s.document.on['nellis:filterpick']({ detail: { href: W44 } });
  await flush();
  assert.ok(s.overlay().classList.contains('currentRight'), 'a menu pick slides too');
  tick();
  assert.equal(s.shown(), 'w44');
  assert.equal(s.location.pathname, W44);
  assert.equal(s.document.title, 'w44 | Nellis');
  assert.equal(s.panel().scrollTop, 0);
  assert.deepEqual(s.log, [
    ['title', 'w44 | Nellis'], ['push', W44], ['event', 'nellis:projectswitch'],
  ]);
});

test('a menu pick of the open project or of no project does nothing', async () => {
  await Promise.all([ZEPHYR, null].map(async (href) => {
    const s = load();
    s.panel().scrollTop = 300;
    s.document.on['nellis:filterpick']({ detail: { href } });
    await flush();
    assert.equal(s.panel().scrollTop, 300, String(href));
    assert.deepEqual(s.fetched, []);
    assert.deepEqual(s.log, []);
  }));
});

test('a desktop switch slides the new project in, then swaps it under the overlay', async () => {
  const s = load(W44);
  const o = s.overlay();
  const crumb = () => o.querySelector('.projectBreadcrumbs');
  s.click(ZEPHYR);
  await flush();
  assert.deepEqual(s.log, [
    ['title', 'zephyr | Nellis'], ['push', ZEPHYR], ['event', 'nellis:projectswitch'],
  ], 'the URL and the head change at once');
  assert.ok(o.classList.contains('currentRight'));
  assert.equal(crumb().text, 'zephyr');
  assert.equal(o.childNodes.at(-1).className, 'footer mobFoot', 'the node copy keeps the foot');
  assert.equal(o.querySelectorAll('.footer.mobFoot').length, 1);
  assert.ok(o.querySelector('video').playedMuted, 'the overlay hero video plays');
  assert.equal(s.swipers.created.length, 0, 'no slider in the overlay');
  assert.equal(s.shown(), 'w44', 'the old project stays under the overlay');
  s.moves();
  tick(799);
  assert.equal(s.shown(), 'w44');
  tick(1);
  assert.equal(s.shown(), 'zephyr');
  assert.equal(s.panel().scrollTop, 0);
  assert.equal(s.swipers.created.length, 1);
  assert.equal(o.className, 'currentProject2', 'the overlay snaps back');
  assert.ok(o.reflows >= 1);
  assert.deepEqual(o.childNodes, []);
});

test('the 0.8 s count starts when the slide moves; no move swaps at 1.6 s', async () => {
  const late = load(W44);
  late.click(ZEPHYR);
  await flush();
  tick(600);
  late.overlay().on.transitionstart({ target: late.panel(), propertyName: 'right' });
  late.overlay().on.transitionstart({ target: late.overlay(), propertyName: 'opacity' });
  tick(800);
  assert.equal(late.shown(), 'w44', 'other targets and properties do not start the count');
  late.moves();
  tick(799);
  assert.equal(late.shown(), 'w44', 'a late start still gets the whole 0.8 s');
  tick(1);
  assert.equal(late.shown(), 'zephyr');
  late.moves();
  tick();
  assert.equal(late.overlay().className, 'currentProject2', 'a stray event does nothing');
  const never = load(W44);
  never.click(ZEPHYR);
  await flush();
  tick(1599);
  assert.equal(never.shown(), 'w44');
  tick(1);
  assert.equal(never.shown(), 'zephyr');
});

test('a fast second click slides only the last project', async () => {
  const s = load();
  s.click(W44);
  await flush();
  tick(400);
  s.click(ATHENA);
  await flush();
  s.moves();
  assert.equal(s.overlay().querySelector('.projectBreadcrumbs').text, 'athena');
  assert.equal(s.overlay().querySelectorAll('.projectBreadcrumbs').length, 1);
  assert.ok(s.overlay().classList.contains('currentRight'));
  tick(400);
  assert.equal(s.shown(), 'zephyr', 'the first timer is gone');
  tick(400);
  assert.equal(s.shown(), 'athena');
  assert.equal(s.location.pathname, ATHENA);
  assert.equal(s.document.title, 'athena | Nellis');
  assert.equal(s.overlay().className, 'currentProject2');
});

test('popstate during a slide snaps the overlay back and swaps at once', async () => {
  const s = load();
  s.click(W44);
  await flush();
  s.back(ZEPHYR);
  await flush();
  assert.equal(s.overlay().className, 'currentProject2');
  assert.deepEqual(s.overlay().childNodes, []);
  assert.equal(s.shown(), 'zephyr');
  assert.equal(s.document.title, 'zephyr | Nellis');
  tick();
  assert.equal(s.shown(), 'zephyr', 'the cleared timer does not swap to w44');
});

test('Back and Forward do not slide', async () => {
  const s = load();
  s.back(W44);
  await flush();
  assert.equal(s.shown(), 'w44');
  assert.equal(s.overlay().className, 'currentProject2');
  assert.equal(s.overlay().childNodes.length, 2, 'the theme overlay stays');
});

test('mobile swaps at once, without the overlay', async () => {
  const s = load(ZEPHYR, false);
  s.click(W44);
  await flush();
  assert.equal(s.shown(), 'w44');
  assert.equal(s.overlay().className, 'currentProject2');
  assert.equal(s.overlay().childNodes.length, 2);
  assert.ok(s.overlay().querySelector('.swiper').swiper, 'the theme slider stays');
});
