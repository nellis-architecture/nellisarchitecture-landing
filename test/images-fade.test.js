const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { walk } = require('../build/lib/images');

const ROOT = path.join(__dirname, '..');
const PARTIAL = fs.readFileSync(path.join(ROOT, 'build/lib/partials/images-css.html'), 'utf8');
const CSS = PARTIAL.match(/<style id="nellis-images-css">([\s\S]*?)<\/style>/)[1];
const SCRIPT = PARTIAL.match(/<script id="nellis-images-js">([\s\S]*?)<\/script>/)[1];

function fakeImg(complete) {
  const classes = new Set();
  return {
    tagName: 'IMG', complete, classList: { add: (c) => classes.add(c) }, classes,
  };
}

/* Runs the partial script against a fake document; returns the hooks it registered. */
function run(imgs) {
  const listeners = {};
  const htmlClasses = new Set();
  let observer;
  const doc = {
    documentElement: { classList: { add: (c) => htmlClasses.add(c) } },
    body: {},
    querySelectorAll: () => imgs,
    addEventListener: (type, fn, capture) => {
      listeners[type] = { fn, capture };
    },
  };
  function MutationObserver(fn) {
    observer = { fn };
    this.observe = (target, options) => Object.assign(observer, { target, options });
  }
  vm.runInNewContext(SCRIPT, { document: doc, MutationObserver });
  return {
    listeners, htmlClasses, doc, observer: () => observer,
  };
}

test('the script adds .js to <html> at once', () => {
  assert.deepEqual([...run([]).htmlClasses], ['js']);
});

test('load and error on an img set .is-loaded, with capture listeners on document', () => {
  const { listeners } = run([]);
  ['load', 'error'].forEach((type) => {
    assert.equal(listeners[type].capture, true);
    const img = fakeImg(false);
    listeners[type].fn({ target: img });
    assert.ok(img.classes.has('is-loaded'), type);
    const script = { tagName: 'SCRIPT', classList: { add: () => assert.fail('not an img') } };
    listeners[type].fn({ target: script });
  });
});

test('at DOMContentLoaded only the complete images get .is-loaded', () => {
  const done = fakeImg(true);
  const waiting = fakeImg(false);
  const { listeners } = run([done, waiting]);
  assert.ok(!done.classes.has('is-loaded'));
  listeners.DOMContentLoaded.fn();
  assert.ok(done.classes.has('is-loaded'));
  assert.ok(!waiting.classes.has('is-loaded'));
});

test('inserted pictures: complete images (direct or nested) get .is-loaded', () => {
  const { listeners, observer, doc } = run([]);
  listeners.DOMContentLoaded.fn();
  const { fn, target, options } = observer();
  assert.equal(target, doc.body);
  assert.deepEqual({ ...options }, { childList: true, subtree: true });
  const direct = fakeImg(true);
  const nested = fakeImg(true);
  const waiting = fakeImg(false);
  const wrap = { tagName: 'PICTURE', querySelectorAll: () => [nested, waiting] };
  fn([{ addedNodes: [direct, wrap, { tagName: undefined }] }]);
  assert.ok(direct.classes.has('is-loaded'));
  assert.ok(nested.classes.has('is-loaded'));
  assert.ok(!waiting.classes.has('is-loaded'));
});

test('the fade: only under .js, only lazy images, no motion when reduced', () => {
  const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2] }));
  rules.filter((r) => /opacity|transition/.test(r.body)).forEach((r) => {
    assert.match(r.sel, /^\.js picture img\[loading="lazy"\]/, r.sel);
  });
  assert.ok(rules.some((r) => r.sel.endsWith(':not(.is-loaded)') && /opacity: 0;/.test(r.body)));
  assert.ok(rules.some((r) => /transition: opacity 400ms;/.test(r.body)));
  const reduced = CSS.split('@media (prefers-reduced-motion: reduce)')[1];
  assert.match(reduced, /\.js picture img\[loading="lazy"\] \{\s*transition: none;/);
  assert.ok(!/fetchpriority/.test(CSS));
});

test('every generated page has the script and the CSS once, no token left', () => {
  const pages = ['index.html', 'studio/index.html', 'people/index.html', 'privacy/index.html',
    'contact/index.html', ...walk(path.join(ROOT, 'projects')), ...walk(path.join(ROOT, 'news'))]
    .map((f) => path.resolve(ROOT, f)).filter((f) => f.endsWith('index.html'));
  assert.ok(pages.length > 20);
  pages.forEach((f) => {
    const html = fs.readFileSync(f, 'utf8');
    assert.equal(html.split('<script id="nellis-images-js">').length - 1, 1, f);
    assert.equal(html.split('<style id="nellis-images-css">').length - 1, 1, f);
    assert.ok(!html.includes('{{'), f);
    (html.match(/<img\b[^>]*fetchpriority="high"[^>]*>/g) || []).forEach((img) => {
      assert.ok(!img.includes('loading="lazy"'), `${f}: ${img}`);
    });
  });
});
