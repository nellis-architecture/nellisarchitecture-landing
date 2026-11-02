const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DESIRED_ADDRESSES, readRecords, sendingDomain, recordKey, isManaged, dnsPlan, settingsPlan,
  addressPlan, routingPlan, mailChanged, domainPlan, redirectChanged, WWW_REDIRECT, run,
} = require('../infra/zone');

const ROOT = path.join(__dirname, '..');
const SUB = 'forms.nellisarchitecture.com';
const APEX = 'nellisarchitecture.com';
const rec = (type, name, x = {}) => ({
  type, name, ttl: 1, proxied: false, ...x,
});
const a = rec('A', APEX, { content: '192.124.249.69' });
const mx = (n, priority = 0) => rec('MX', APEX, {
  content: `mx${n}-usg2.ppe-hosted.com`, priority,
});
const txt1 = rec('TXT', APEX, { content: 'v=spf1 ~all' });
const txt2 = rec('TXT', APEX, { content: 'NETORGFT14520862.onmicrosoft.com' });
const srv = rec('SRV', `_sip._tls.${APEX}`, {
  data: {
    priority: 100, weight: 1, port: 443, target: 'sipdir.online.lync.com',
  },
});
const withIds = (list) => list.map((r, i) => ({ id: `id${i}`, ...r }));
const empty = { posts: [], patches: [], deletes: [] };

test('dnsPlan: empty zone posts all records', () => {
  const desired = [a, mx(1), txt1];
  assert.deepEqual(dnsPlan([], desired, SUB), { ...empty, posts: desired });
});

test('dnsPlan: equal records give an empty plan', () => {
  const desired = [a, mx(1), mx(2), mx(3), txt1, txt2, srv];
  assert.deepEqual(dnsPlan(withIds(desired), desired, SUB), empty);
});

test('dnsPlan: a ttl, proxied or comment change is a patch with the live id', () => {
  const live = withIds([
    { ...a, ttl: 3600 }, { ...txt1, proxied: true }, { ...txt2, comment: 'x' },
  ]);
  const plan = dnsPlan(live, [a, txt1, txt2], SUB);
  assert.deepEqual(plan.patches.map((p) => p.id), ['id0', 'id1', 'id2']);
  assert.equal(plan.patches[0].ttl, 1);
  assert.equal(plan.patches[2].comment, '');
  assert.deepEqual([plan.posts, plan.deletes], [[], []]);
});

test('dnsPlan: a null live comment equals no comment', () => {
  assert.deepEqual(dnsPlan(withIds([{ ...a, comment: null }]), [a], SUB), empty);
});

test('dnsPlan: MX x3 and TXT x2 on one name match one to one', () => {
  const live = withIds([mx(3), txt2, mx(1), txt1, mx(2)]);
  assert.deepEqual(dnsPlan(live, [mx(1), mx(2), mx(3), txt1, txt2], SUB), empty);
  const plan = dnsPlan(withIds([mx(1), mx(1)]), [mx(1)], SUB);
  assert.deepEqual(plan, { ...empty, deletes: [{ id: 'id1' }] });
});

test('dnsPlan: an MX priority change is a delete and a post', () => {
  const plan = dnsPlan(withIds([mx(1, 10)]), [mx(1)], SUB);
  assert.deepEqual(plan, { posts: [mx(1)], patches: [], deletes: [{ id: 'id0' }] });
});

test('dnsPlan: SRV matches by data', () => {
  assert.deepEqual(dnsPlan(withIds([srv]), [srv], SUB), empty);
  const moved = { ...srv, data: { ...srv.data, port: 5061 } };
  const plan = dnsPlan(withIds([moved]), [srv], SUB);
  assert.deepEqual(plan, { posts: [srv], patches: [], deletes: [{ id: 'id0' }] });
});

test('dnsPlan: a trailing dot or uppercase target matches', () => {
  const cname = rec('CNAME', `www.${APEX}`, { content: APEX });
  const live = withIds([
    { ...cname, name: `WWW.${APEX}`, content: 'Nellisarchitecture.com.' },
    { ...mx(1), content: 'MX1-usg2.ppe-hosted.com.' },
    { ...srv, data: { ...srv.data, target: 'SIPDIR.online.lync.com.' } },
  ]);
  assert.deepEqual(dnsPlan(live, [cname, mx(1), srv], SUB), empty);
});

test('dnsPlan: TXT with and without outer quotes match', () => {
  const live = withIds([{ ...txt1, content: `"${txt1.content}"` }]);
  assert.deepEqual(dnsPlan(live, [txt1], SUB), empty);
  assert.equal(recordKey(txt1), recordKey(live[0]));
});

test('dnsPlan: managed records are never deleted or patched', () => {
  const live = withIds([
    rec('MX', SUB, { content: 'route1.mx.cloudflare.net', priority: 10 }),
    rec('TXT', `cf2024-1._domainkey.${SUB}`, { content: 'v=DKIM1' }),
    rec('NS', APEX, { content: 'ns1.cloudflare.com' }),
    rec('SOA', APEX, { content: 'soa' }),
    rec('TXT', `x.${APEX}`, { content: 'ro', meta: { read_only: true } }),
    rec('MX', `y.${APEX}`, { content: 'r', priority: 1, meta: { email_routing: true } }),
  ]);
  live.forEach((r) => assert.ok(isManaged(r, SUB), r.name));
  assert.deepEqual(dnsPlan(live, [], SUB), empty);
});

test('dnsPlan: an extra non-managed live record is deleted', () => {
  const live = withIds([a, rec('A', `old.${APEX}`, { content: '1.2.3.4' })]);
  assert.deepEqual(dnsPlan(live, [a], SUB), { ...empty, deletes: [{ id: 'id1' }] });
});

const tmpRoot = (records) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zone-'));
  fs.mkdirSync(path.join(dir, 'infra'));
  fs.copyFileSync(path.join(ROOT, 'wrangler.jsonc'), path.join(dir, 'wrangler.jsonc'));
  fs.writeFileSync(path.join(dir, 'infra/dns.json'), JSON.stringify(records));
  return dir;
};

test('readRecords: rejects bad types, missing fields, forms.* names, a long comment', () => {
  const bad = [
    rec('NS', APEX, { content: 'ns1.example.com' }),
    rec('SOA', APEX, { content: 'soa' }),
    rec('PTR', APEX, { content: 'x' }),
    {
      type: 'A', name: APEX, content: '1.2.3.4', proxied: false,
    },
    {
      type: 'A', name: APEX, content: '1.2.3.4', ttl: 1,
    },
    rec('MX', SUB, { content: 'x.example.com', priority: 1 }),
    rec('TXT', `a.${SUB}`, { content: 'x' }),
    rec('MX', APEX, { content: 'x.example.com' }),
    rec('TXT', APEX, { content: 'x', comment: 'c'.repeat(101) }),
  ];
  bad.forEach((r) => assert.throws(() => readRecords(tmpRoot([r])), /infra\/dns\.json/));
});

test('readRecords: accepts the real dns.json', () => {
  assert.ok(readRecords().length > 0);
});

test('dns.json: no apex A (the Worker domain), apex MX Proofpoint, only www proxied', () => {
  const records = readRecords();
  const web = records.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type) && r.name === APEX);
  assert.deepEqual(web, []);
  const apexMx = records.filter((r) => r.type === 'MX' && r.name === APEX)
    .map((r) => r.content).sort();
  assert.deepEqual(apexMx, [1, 2, 3].map((n) => `mx${n}-usg2.ppe-hosted.com`));
  assert.deepEqual(records.filter((r) => r.proxied).map((r) => r.name), [`www.${APEX}`]);
});

test('domainPlan: attach a hostname that is missing or on another Worker', () => {
  assert.deepEqual(domainPlan([], [APEX], 'landing'), [APEX]);
  assert.deepEqual(domainPlan([{ hostname: APEX, service: 'landing' }], [APEX], 'landing'), []);
  assert.deepEqual(domainPlan([{ hostname: APEX, service: 'old' }], [APEX], 'landing'), [APEX]);
});

test('redirectChanged: only the one www rule counts as no change', () => {
  const live = {
    ...WWW_REDIRECT, id: 'r1', version: '2', enabled: true,
  };
  assert.equal(redirectChanged([live]), false);
  assert.equal(redirectChanged(null), true);
  assert.equal(redirectChanged([]), true);
  assert.equal(redirectChanged([live, { ...live, ref: 'other' }]), true);
  const to = { ...WWW_REDIRECT.action_parameters.from_value, status_code: 302 };
  assert.equal(redirectChanged([{ ...live, action_parameters: { from_value: to } }]), true);
});

test('sendingDomain: the domain of MAIL_FROM', () => {
  assert.equal(sendingDomain(), SUB);
});

test('DESIRED_ADDRESSES equals the TO addresses and the send_email allow-list', () => {
  const text = fs.readFileSync(path.join(ROOT, 'worker/email.js'), 'utf8');
  const to = text.match(/const TO = \{([^}]*)\}/)[1].match(/[\w.-]+@[\w.-]+/g);
  assert.deepEqual([...to].sort(), [...DESIRED_ADDRESSES].sort());
  const wrangler = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8'));
  const [binding] = wrangler.send_email;
  assert.equal(binding.name, 'EMAIL');
  const allowed = [...binding.allowed_destination_addresses].sort();
  assert.deepEqual(allowed, [...DESIRED_ADDRESSES].sort());
});

test('settingsPlan: equal gives nothing, a difference gives a change', () => {
  const want = { ssl: 'strict', always_use_https: 'on' };
  assert.deepEqual(settingsPlan([{ id: 'ssl', value: 'strict' }], want), []);
  assert.deepEqual(settingsPlan([{ id: 'ssl', value: 'full' }], want), [['ssl', 'strict']]);
});

test('addressPlan: create missing, list unverified, skip verified', () => {
  const [hello, people] = DESIRED_ADDRESSES;
  const none = addressPlan([], DESIRED_ADDRESSES);
  assert.deepEqual(none, { create: DESIRED_ADDRESSES, unverified: [] });
  const live = [
    { email: hello, verified: null }, { email: people, verified: '2026-10-16T00:00:00Z' },
  ];
  assert.deepEqual(addressPlan(live, DESIRED_ADDRESSES), { create: [], unverified: [hello] });
});

const subMx = rec('MX', SUB, { content: 'route1.mx.cloudflare.net', priority: 10 });

test('routingPlan: enable until forms.* is ready with its MX, pending or active zone', () => {
  const plan = (routing, liveRecords) => routingPlan({ routing, liveRecords, sub: SUB });
  const ready = { subdomains: [{ name: SUB, enabled: true, status: 'ready' }] };
  assert.equal(plan(ready, [subMx]), 'none');
  assert.equal(plan(ready, [mx(1)]), 'enable');
  assert.equal(plan({ enabled: true, status: 'misconfigured' }, [subMx]), 'enable');
  assert.equal(
    plan({ subdomains: [{ name: SUB, enabled: true, status: 'pending' }] }, [subMx]),
    'enable',
  );
  assert.equal(plan({ enabled: false, status: 'unconfigured' }, []), 'enable');
});

test('mailChanged: the apex MX and SPF, managed records included', () => {
  const desired = [a, mx(1), mx(2), mx(3), txt1, txt2];
  const live = withIds(desired);
  assert.equal(mailChanged(live, desired), false);
  assert.equal(mailChanged([...live, subMx], desired), false);
  const cfMx = rec('MX', APEX, {
    content: 'route1.mx.cloudflare.net',
    priority: 29,
    meta: { email_routing: true, read_only: true },
  });
  assert.equal(mailChanged([...live, cfMx], desired), true);
  assert.equal(mailChanged(
    live.filter((r) => r.type !== 'MX' || r.content !== mx(2).content),
    desired,
  ), true);
  const otherSpf = live.map((r) => (r.content === txt1.content
    ? { ...r, content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' } : r));
  assert.equal(mailChanged(otherSpf, desired), true);
});

const fakeApi = (routes, calls = []) => async (url, { method = 'GET', body } = {}) => {
  calls.push({ method, url, body });
  const key = `${method} ${url.split('?')[0]}`;
  const hit = routes[key];
  if (hit === undefined) throw new Error(`unexpected ${key}`);
  return typeof hit === 'function' ? hit() : hit;
};

const noWrite = (routes) => {
  const calls = [];
  return { calls, api: fakeApi(routes, calls) };
};

const quiet = (t) => {
  const log = t.mock.method(console, 'log', () => {});
  return () => log.mock.calls.map((c) => c.arguments[0]).join('\n');
};

const PHASE = '/zones/z/rulesets/phases/http_request_dynamic_redirect/entrypoint';

const zoneRoutes = (status, records) => ({
  'GET /zones': [{ id: 'z', status, name_servers: ['a.ns.cloudflare.com'] }],
  'GET /zones/z/dns_records': records,
  'GET /zones/z/settings/always_use_https': { id: 'always_use_https', value: 'off' },
  'GET /zones/z/settings/ssl': { id: 'ssl', value: 'full' },
  'GET /accounts/acc/email/routing/addresses': [],
  'GET /zones/z/email/routing': { enabled: false, status: 'unconfigured' },
  'GET /zones/z/email/auth/dmarc-reports': { enabled: true },
  'GET /accounts/acc/workers/domains': [{ hostname: APEX, service: 'landing' }],
  [`GET ${PHASE}`]: { rules: [WWW_REDIRECT] },
});

test('run plan: a missing zone prints "would create" and writes nothing', async (t) => {
  const out = quiet(t);
  const { api, calls } = noWrite({ 'GET /zones': [] });
  await run({ api, acct: 'acc', write: false });
  assert.match(out(), /zone: would create/);
  assert.match(out(), /dns: post MX\|nellisarchitecture.com\|0 mx1-usg2.ppe-hosted.com/);
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('run plan: no Worker domain and no redirect yet: attach the apex, set the rule', async (t) => {
  const out = quiet(t);
  const { api, calls } = noWrite({
    ...zoneRoutes('active', withIds(readRecords())),
    'GET /accounts/acc/workers/domains': [],
    [`GET ${PHASE}`]: () => {
      throw new Error(`GET ${PHASE}: HTTP 404 []`);
    },
  });
  await run({ api, acct: 'acc', write: false });
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.match(out(), /worker domain: would attach nellisarchitecture.com to landing/);
  assert.match(out(), /redirect: would set www.nellisarchitecture.com → https:\/\/nellisarch/);
});

test('run plan: a pending zone with differences writes nothing', async (t) => {
  const out = quiet(t);
  const live = [{ id: 'old', ...rec('A', `old.${APEX}`, { content: '1.2.3.4' }) }];
  const { api, calls } = noWrite(zoneRoutes('pending', live));
  await run({ api, acct: 'acc', write: false });
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.match(out(), /dns: delete old/);
  assert.match(out(), /routing: would enable on forms/);
});

test('run plan: an active zone without routing or DMARC reports would enable both', async (t) => {
  const out = quiet(t);
  const { api, calls } = noWrite({
    ...zoneRoutes('active', withIds(readRecords())),
    'GET /zones/z/email/auth/dmarc-reports': { enabled: false },
  });
  await run({ api, acct: 'acc', write: false });
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.match(out(), /routing: would enable on forms.nellisarchitecture.com/);
  assert.match(out(), /dmarc reports: would enable/);
});

test('run write: the guard throws when the apex MX changes after routing', async (t) => {
  quiet(t);
  let reads = 0;
  const good = withIds(readRecords());
  const cfMx = {
    id: 'cf',
    ...rec('MX', APEX, { content: 'route1.mx.cloudflare.net', priority: 29 }),
    meta: { email_routing: true, read_only: true },
  };
  const routes = {
    ...zoneRoutes('active', good),
    'GET /zones/z/dns_records': () => {
      reads += 1;
      return reads < 3 ? good : [...good, cfMx];
    },
    'PATCH /zones/z/settings/always_use_https': {},
    'PATCH /zones/z/settings/ssl': {},
    'POST /accounts/acc/email/routing/addresses': {},
    'POST /zones/z/email/routing/dns': {},
  };
  await assert.rejects(
    run({ api: fakeApi(routes), acct: 'acc', write: true }),
    /apex MX or SPF changed/,
  );
});

test('run write: the guard throws when the records differ after routing', async (t) => {
  quiet(t);
  const calls = [];
  let reads = 0;
  const good = withIds(readRecords());
  const routes = {
    ...zoneRoutes('pending', good),
    'GET /zones/z/dns_records': () => {
      reads += 1;
      return reads < 3 ? good : good.slice(1);
    },
    'PATCH /zones/z/settings/always_use_https': {},
    'PATCH /zones/z/settings/ssl': {},
    'POST /accounts/acc/email/routing/addresses': {},
    'POST /zones/z/email/routing/dns': {},
  };
  await assert.rejects(
    run({ api: fakeApi(routes, calls), acct: 'acc', write: true }),
    /records changed outside forms.nellisarchitecture.com/,
  );
  assert.ok(calls.some((c) => c.url === '/zones/z/email/routing/dns'
    && c.body.name === SUB));
});

test('run write: creates a missing zone with type full', async (t) => {
  quiet(t);
  const calls = [];
  const good = withIds(readRecords());
  const routes = {
    ...zoneRoutes('pending', good),
    'GET /zones': [],
    'POST /zones': { id: 'z', status: 'pending', name_servers: [] },
    'PATCH /zones/z/settings/always_use_https': {},
    'PATCH /zones/z/settings/ssl': {},
    'POST /accounts/acc/email/routing/addresses': {},
    'POST /zones/z/email/routing/dns': {},
  };
  await run({ api: fakeApi(routes, calls), acct: 'acc', write: true });
  const post = calls.find((c) => c.method === 'POST' && c.url === '/zones');
  assert.deepEqual(post.body, { name: APEX, account: { id: 'acc' }, type: 'full' });
});
