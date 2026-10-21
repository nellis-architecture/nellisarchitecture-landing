const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'static-backend.js'), 'utf8');

/* A mock of the browser's own XMLHttpRequest, for the pass-through branch.
   The test delivers the answer with respond()/fail()/progress(), so the
   assertions stay synchronous and deterministic. */
class MockXHR {
  constructor(reals) {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.response = '';
    this.upload = {};
    this.calls = [];
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    reals.push(this);
  }

  open(...args) {
    this.calls.push(['open', ...args]);
  }

  setRequestHeader(k, v) {
    this.calls.push(['setRequestHeader', k, v]);
  }

  send(body) {
    this.calls.push(['send', body]);
  }

  abort() {
    this.calls.push(['abort']);
  }

  respond(status, body) {
    this.readyState = 4;
    this.status = status;
    this.responseText = body;
    this.response = body;
    if (this.onreadystatechange) this.onreadystatechange();
    if (this.onload) this.onload({ type: 'load' });
  }

  fail() {
    if (this.onerror) this.onerror({ type: 'error' });
  }

  progress(loaded, total) {
    this.upload.onprogress({ lengthComputable: true, loaded, total });
  }
}

function load(gridHtml, { thumbSizes = null, file = null, realXHR: RealXHR = MockXHR } = {}) {
  const listeners = {};
  const reals = [];
  const grid = {
    innerHTML: gridHtml,
    querySelector: (sel) => (gridHtml.includes(sel.slice(1)) ? {} : null),
  };
  const fetched = [];
  const window = {
    XMLHttpRequest: function mockRealXHR() {
      return new RealXHR(reals);
    },
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(file || `file:${url}`) });
    },
  };
  const document = {
    addEventListener: (ev, fn) => {
      listeners[ev] = fn;
    },
    querySelector: (sel) => {
      if (sel === '.center .container') return grid;
      const thumb = thumbSizes && { getAttribute: () => thumbSizes };
      return sel === '.centerMini .project__item img[sizes]' ? thumb : null;
    },
  };
  vm.runInNewContext(SRC, { window, document, URLSearchParams });
  listeners.DOMContentLoaded();
  const ask = (currentUrl) => new Promise((resolve) => {
    const xhr = new window.XMLHttpRequest();
    xhr.open('POST', '/wp-admin/admin-ajax.php');
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) resolve(xhr.responseText);
    };
    const url = encodeURIComponent(currentUrl);
    xhr.send(`action=get_filtered_projects&currentUrl=${url}&residentalCommercialIF=1`);
  });
  return {
    ask, fetched, reals, XHR: window.XMLHttpRequest,
  };
}

test('the All filter returns the Home grid, not the empty WordPress answer', async () => {
  const { ask, fetched } = load('<div class="project__item">Zoya</div>');
  assert.equal(await ask('All'), '<div class="project__item">Zoya</div>');
  assert.equal(await ask(''), '<div class="project__item">Zoya</div>');
  assert.deepEqual(fetched, []);
});

test('other filters still load their fragment file', async () => {
  const { ask } = load('<div class="project__item">Zoya</div>');
  assert.equal(await ask('master planning'), 'file:/data/filters/master_planning_1.html');
});

test('the All filter falls back to the file on a page with no grid', async () => {
  const { ask } = load('<p>no projects</p>');
  assert.equal(await ask('All'), 'file:/data/filters/all_1.html');
});

const FRAGMENT = '<picture><source type="image/avif" srcset="a.avif 320w" sizes="CARD">'
  + '<img src="a.jpg" sizes="CARD" alt=""></picture>';

test('a filter fragment keeps its card sizes on Home', async () => {
  const { ask } = load('<div class="project__item">Zoya</div>', { file: FRAGMENT });
  assert.equal(await ask('master planning'), FRAGMENT);
});

test('a filter fragment gets the thumb sizes of the project page column', async () => {
  const { ask } = load('<div class="project__item">Zoya</div>', {
    thumbSizes: '(max-width: 980px) 100vw, "x" & 155px', file: FRAGMENT,
  });
  const thumb = '(max-width: 980px) 100vw, &quot;x&quot; &amp; 155px';
  assert.equal(await ask('master planning'), FRAGMENT.replace(/CARD/g, thumb));
});

/* ---- the pass-through branch, as js/forms.js upload() uses it ---- */

function putXHR() {
  const { XHR, reals } = load('<p>no projects</p>');
  const xhr = new XHR();
  xhr.open('PUT', '/api/upload/key0');
  return { xhr, real: reals[0], reals };
}

test('the shim hands out the real upload object, and progress reaches the handler', () => {
  const { xhr, real } = putXHR();
  assert.equal(xhr.upload, real.upload);
  const seen = [];
  xhr.upload.onprogress = (event) => seen.push(event);
  real.progress(40, 100);
  assert.deepEqual(seen, [{ lengthComputable: true, loaded: 40, total: 100 }]);
});

test('a completed upload copies the state, then fires onreadystatechange and onload', () => {
  const { xhr, real } = putXHR();
  const seen = [];
  xhr.onreadystatechange = () => seen.push(`state ${xhr.readyState} ${xhr.status}`);
  xhr.onload = (event) => seen.push(`onload ${event.type}`);
  xhr.send('bytes');
  assert.deepEqual(real.calls, [['open', 'PUT', '/api/upload/key0'], ['send', 'bytes']]);
  real.respond(201, 'stored');
  assert.deepEqual(seen, ['state 4 201', 'onload load']);
  assert.equal(xhr.responseText, 'stored');
  assert.equal(xhr.response, 'stored');
});

test('a 413 answer fires onload, not onerror, and the status reads 413', () => {
  const { xhr, real } = putXHR();
  const seen = [];
  xhr.onload = () => seen.push(`onload ${xhr.status}`);
  xhr.onerror = () => seen.push('onerror');
  xhr.send('too big');
  real.respond(413, 'Payload Too Large');
  assert.deepEqual(seen, ['onload 413']);
});

test('a network failure fires onerror, not onload', () => {
  const { xhr, real } = putXHR();
  const seen = [];
  xhr.onload = () => seen.push('onload');
  xhr.onerror = (event) => seen.push(`onerror ${event.type}`);
  xhr.send('bytes');
  real.fail();
  assert.deepEqual(seen, ['onerror error']);
});

test('the admin-ajax branch answers through onreadystatechange alone', async () => {
  const { XHR, reals } = load('<div class="project__item">Zoya</div>');
  const xhr = new XHR();
  xhr.open('POST', '/wp-admin/admin-ajax.php');
  const seen = [];
  xhr.upload.onprogress = () => seen.push('progress');
  xhr.onload = () => seen.push('onload');
  xhr.onerror = () => seen.push('onerror');
  const done = new Promise((resolve) => {
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      seen.push(`state ${xhr.responseText}`);
      resolve();
    };
  });
  xhr.send('action=get_filtered_projects&currentUrl=All&residentalCommercialIF=1');
  await done;
  assert.deepEqual(seen, ['state <div class="project__item">Zoya</div>']);
  assert.ok(!seen.includes('onload'), 'onload must not fire on the admin-ajax branch');
  assert.deepEqual(reals, []);
});
