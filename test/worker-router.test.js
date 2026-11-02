const {
  test, mock, beforeEach, afterEach,
} = require('node:test');
const assert = require('node:assert/strict');

const load = async () => (await import('../worker/index.js')).default;
const GOOD = {
  form: 'contact',
  name: 'Ann',
  email: 'ann@example.com',
  phone: '1',
  massage: 'Hi',
  'cf-turnstile-response': 'tok',
};
const HOST = 'x.dev';
const siteverify = (data) => mock.method(globalThis, 'fetch', async () => Response.json(data));

beforeEach(() => siteverify({ success: true, hostname: HOST }));
afterEach(() => mock.restoreAll());

const post = (fields = GOOD, headers = {}, url = 'https://x.dev/api/message') => {
  const body = new URLSearchParams(fields).toString();
  return new Request(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(body.length),
      'X-Requested-With': 'fetch',
      ...headers,
    },
  });
};

const fakeEnv = (send = async () => {}) => {
  const env = {
    MAIL_FROM: 'noreply@forms.nellisarchitecture.com',
    TURNSTILE_SECRET: 'real-secret',
    EMAIL: { send: mock.fn(send) },
    ASSETS: { fetch: mock.fn(async () => new Response('asset', { status: 404 })) },
  };
  return env;
};

test('a good POST sends one email and answers 200 JSON with no-store headers', async () => {
  const worker = await load();
  const env = fakeEnv();
  const res = await worker.fetch(post(), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(env.EMAIL.send.mock.callCount(), 1);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('GET /api/message answers 405 with Allow: POST', async () => {
  const worker = await load();
  const env = fakeEnv();
  const res = await worker.fetch(new Request('https://x.dev/api/message'), env);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
  assert.equal(env.ASSETS.fetch.mock.callCount(), 0);
});

test('a POST with no Content-Length answers 411', async () => {
  const worker = await load();
  const req = new Request('https://x.dev/api/message', {
    method: 'POST', headers: { 'X-Requested-With': 'fetch' },
  });
  assert.equal((await worker.fetch(req, fakeEnv())).status, 411);
});

test('a body over 32768 bytes answers 413; 32768 passes the size check', async () => {
  const worker = await load();
  const env = fakeEnv();
  assert.equal((await worker.fetch(post(GOOD, { 'Content-Length': '32769' }), env)).status, 413);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
  const res = await worker.fetch(post(GOOD, { 'Content-Length': '32768' }), env);
  assert.notEqual(res.status, 413);
});

test('a bad field answers 400 with the field name and sends nothing', async () => {
  const worker = await load();
  const env = fakeEnv();
  const res = await worker.fetch(post({ ...GOOD, email: 'nope' }), env);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid field', field: 'email' });
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
});

test('a filled honeypot answers 200 and sends nothing', async () => {
  const worker = await load();
  const env = fakeEnv();
  const res = await worker.fetch(post({ ...GOOD, 'bot-field': 'x' }), env);
  assert.equal(res.status, 200);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
});

test('no EMAIL binding answers 503', async () => {
  const worker = await load();
  const env = fakeEnv();
  delete env.EMAIL;
  const res = await worker.fetch(post(), env);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'email not configured' });
});

test('a send error answers 502 and logs the error', async (t) => {
  const worker = await load();
  const log = t.mock.method(console, 'error', () => {});
  const env = fakeEnv(async () => {
    throw new Error('boom');
  });
  const res = await worker.fetch(post(), env);
  assert.equal(res.status, 502);
  assert.equal(log.mock.callCount(), 1);
});

test('a native POST from a page gets an HTML page with a link back', async () => {
  const worker = await load();
  const req = post(GOOD, { Accept: 'text/html,application/xhtml+xml', 'X-Requested-With': '' });
  const res = await worker.fetch(req, fakeEnv());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/html/);
  const html = await res.text();
  assert.ok(html.includes('Thank you. Your message has been sent.'));
  assert.ok(html.includes('<a href="/contact/">'));
});

test('a fetch POST that accepts HTML still gets JSON', async () => {
  const worker = await load();
  const res = await worker.fetch(post(GOOD, { Accept: 'text/html' }), fakeEnv());
  assert.match(res.headers.get('Content-Type'), /^application\/json/);
});

test('other paths, other /api/ paths and / go to the static assets', async () => {
  const worker = await load();
  const env = fakeEnv();
  const urls = ['https://x.dev/api/x', 'https://x.dev/', 'https://x.dev/api/message/extra'];
  await Promise.all(urls.map((url) => worker.fetch(new Request(url), env)));
  assert.deepEqual(env.ASSETS.fetch.mock.calls.map((c) => c.arguments[0].url), urls);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
});

test('the Turnstile check gets the token, the client IP and the request host', async () => {
  const worker = await load();
  await worker.fetch(post(GOOD, { 'CF-Connecting-IP': '1.2.3.4' }), fakeEnv());
  const { body } = globalThis.fetch.mock.calls[0].arguments[1];
  assert.equal(body.toString(), 'secret=real-secret&response=tok&remoteip=1.2.3.4');
});

test('a failed Turnstile check answers 403 and sends nothing', async () => {
  const worker = await load();
  siteverify({ success: false });
  const env = fakeEnv();
  assert.equal((await worker.fetch(post(), env)).status, 403);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
});

test('a token for another host answers 403 and sends nothing', async () => {
  const worker = await load();
  siteverify({ success: true, hostname: 'evil.example' });
  const env = fakeEnv();
  assert.equal((await worker.fetch(post(), env)).status, 403);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
});

test('no token answers 400 and sends nothing', async () => {
  const worker = await load();
  const { 'cf-turnstile-response': _, ...fields } = GOOD;
  const env = fakeEnv();
  assert.equal((await worker.fetch(post(fields), env)).status, 400);
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('no TURNSTILE_SECRET answers 503 and sends nothing', async () => {
  const worker = await load();
  const env = fakeEnv();
  delete env.TURNSTILE_SECRET;
  const res = await worker.fetch(post(), env);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'turnstile not configured' });
  assert.equal(env.EMAIL.send.mock.callCount(), 0);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('/api/auth and /api/callback go to the CMS login; /api/authx goes to the assets', async () => {
  const worker = await load();
  const env = fakeEnv();
  const auth = await worker.fetch(new Request('https://x.dev/api/auth?provider=github'), env);
  const back = await worker.fetch(new Request('https://x.dev/api/callback'), env);
  assert.equal(auth.status, 503);
  assert.equal(back.status, 503);
  await worker.fetch(new Request('https://x.dev/api/authx'), env);
  const urls = env.ASSETS.fetch.mock.calls.map((c) => c.arguments[0].url);
  assert.deepEqual(urls, ['https://x.dev/api/authx']);
});
