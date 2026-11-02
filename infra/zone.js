const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ZONE = 'nellisarchitecture.com';
const DESIRED_SETTINGS = { always_use_https: 'on', ssl: 'strict' };
const DESIRED_ADDRESSES = ['hello@nellisarchitecture.com', 'people@nellisarchitecture.com'];
const CONTENT_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'];
const DATA_TYPES = ['SRV', 'CAA'];

// wrangler.jsonc has no comments, so JSON.parse reads it (as in infra/cloudflare.js).
const sendingDomain = (root = ROOT) => {
  const { vars } = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  return vars.MAIL_FROM.split('@')[1].toLowerCase();
};

const under = (name, sub) => {
  const n = name.toLowerCase();
  return n === sub || n.endsWith(`.${sub}`);
};

const readRecords = (root = ROOT) => {
  const sub = sendingDomain(root);
  const records = JSON.parse(fs.readFileSync(path.join(root, 'infra/dns.json'), 'utf8'));
  records.forEach((r, i) => {
    const where = `infra/dns.json [${i}] ${r.type} ${r.name}`;
    const fail = (why) => {
      throw new Error(`${where}: ${why}`);
    };
    if (!CONTENT_TYPES.includes(r.type) && !DATA_TYPES.includes(r.type)) fail('type not allowed');
    if (typeof r.name !== 'string' || !r.name) fail('no name');
    if (DATA_TYPES.includes(r.type) ? !r.data : typeof r.content !== 'string') fail('no value');
    if (r.type === 'MX' && !Number.isInteger(r.priority)) fail('MX needs priority');
    if (!Number.isInteger(r.ttl)) fail('no ttl');
    if (typeof r.proxied !== 'boolean') fail('no proxied');
    if (under(r.name, sub)) fail(`${sub} is for Email Routing only`);
  });
  return records;
};

const host = (s) => String(s).toLowerCase().replace(/\.$/, '');

const keyContent = (r) => {
  switch (r.type) {
    case 'CNAME': return host(r.content);
    case 'MX': return `${r.priority} ${host(r.content)}`;
    case 'SRV': return `${r.data.priority} ${r.data.weight} ${r.data.port} ${host(r.data.target)}`;
    case 'CAA': return `${r.data.flags} ${r.data.tag} ${r.data.value}`;
    case 'TXT': return r.content.replace(/^"(.*)"$/s, '$1');
    default: return r.content;
  }
};

const recordKey = (r) => `${r.type}|${r.name.toLowerCase()}|${keyContent(r)}`;

const isManaged = (r, sub) => under(r.name, sub)
  || (['NS', 'SOA'].includes(r.type) && r.name.toLowerCase() === ZONE)
  || Boolean(r.meta && (r.meta.read_only || r.meta.email_routing));

const dnsPlan = (live, desired, sub) => {
  const free = live.filter((r) => !isManaged(r, sub));
  const posts = [];
  const patches = [];
  desired.forEach((d) => {
    const key = recordKey(d);
    const i = free.findIndex((r) => recordKey(r) === key);
    if (i < 0) {
      posts.push(d);
      return;
    }
    const [match] = free.splice(i, 1);
    if (match.ttl !== d.ttl || match.proxied !== d.proxied
      || (match.comment || '') !== (d.comment || '')) {
      patches.push({ id: match.id, ...d, comment: d.comment || '' });
    }
  });
  return { posts, patches, deletes: free.map((r) => ({ id: r.id })) };
};

// live: [{ id, value }], the GET answer of each setting.
const settingsPlan = (live, desired) => live
  .filter((s) => s.id in desired && s.value !== desired[s.id])
  .map((s) => [s.id, desired[s.id]]);

// live: [{ email, verified }]. verified is a timestamp, or null.
const addressPlan = (live, desired) => ({
  create: desired.filter((e) => !live.some((a) => a.email === e)),
  unverified: desired.filter((e) => live.some((a) => a.email === e && !a.verified)),
});

// Enabling routing on the subdomain adds MX, SPF and a DKIM record there and leaves the apex
// MX and SPF alone (tested on an active zone with a foreign apex MX, LND-104).
const routingPlan = ({ routing, liveRecords, sub }) => {
  const mx = liveRecords.some((r) => r.type === 'MX' && under(r.name, sub));
  const ready = Boolean(routing && (routing.subdomains || [])
    .some((s) => s.name === sub && s.enabled && s.status === 'ready'));
  return ready && mx ? 'none' : 'enable';
};

// The apex MX and SPF (managed records too) must equal infra/dns.json.
const apexMail = (records) => records
  .filter((r) => r.name.toLowerCase() === ZONE
    && (r.type === 'MX' || (r.type === 'TXT' && keyContent(r).startsWith('v=spf1'))))
  .map(recordKey).sort();

const mailChanged = (live, desired) => apexMail(live).join('\n') !== apexMail(desired).join('\n');

const isEmpty = (plan) => !plan.posts.length && !plan.patches.length && !plan.deletes.length;

const printDns = (plan) => {
  plan.posts.forEach((r) => console.log(`dns: post ${recordKey(r)}`));
  plan.patches.forEach((r) => console.log(`dns: patch ${recordKey(r)} (${r.id})`));
  plan.deletes.forEach((r) => console.log(`dns: delete ${r.id}`));
};

// Upgrade: paginate when the zone has more than 5000 records.
const listRecords = (api, id) => api(`/zones/${id}/dns_records?per_page=5000`);

const run = async ({
  api, acct, write, root = ROOT,
}) => {
  const desired = readRecords(root);
  const sub = sendingDomain(root);
  const pre = write ? '' : 'would ';
  let changes = 0;

  const zones = await api(`/zones?name=${ZONE}&account.id=${acct}`);
  let zone = zones[0];
  if (!zone && !write) {
    console.log('zone: would create');
    printDns(dnsPlan([], desired, sub));
    return;
  }
  if (!zone) {
    const body = { name: ZONE, account: { id: acct }, type: 'full' };
    zone = await api('/zones', { method: 'POST', body });
    console.log(`zone: ${ZONE} created`);
    changes += 1;
  }
  console.log(`zone: ${zone.status}; name servers ${(zone.name_servers || []).join(', ')}`);

  const plan = dnsPlan(await listRecords(api, zone.id), desired, sub);
  printDns(plan);
  if (!isEmpty(plan)) {
    changes += 1;
    if (write) await api(`/zones/${zone.id}/dns_records/batch`, { method: 'POST', body: plan });
  }

  const live = await Promise.all(Object.keys(DESIRED_SETTINGS)
    .map((s) => api(`/zones/${zone.id}/settings/${s}`)));
  await settingsPlan(live, DESIRED_SETTINGS).reduce((chain, [id, value]) => chain.then(async () => {
    if (write) await api(`/zones/${zone.id}/settings/${id}`, { method: 'PATCH', body: { value } });
    console.log(`setting: ${pre}set ${id} ${value}`);
    changes += 1;
  }), Promise.resolve());

  const addrPath = `/accounts/${acct}/email/routing/addresses`;
  const addr = addressPlan(await api(addrPath), DESIRED_ADDRESSES);
  await addr.create.reduce((chain, email) => chain.then(async () => {
    if (write) await api(addrPath, { method: 'POST', body: { email } });
    console.log(`address: ${pre}create ${email}`);
    changes += 1;
  }), Promise.resolve());
  [...addr.create, ...addr.unverified].forEach((email) => {
    console.log(`address: ${email} not verified: click the verification email`);
  });

  const routing = await api(`/zones/${zone.id}/email/routing`);
  const route = routingPlan({ routing, liveRecords: await listRecords(api, zone.id), sub });
  if (route === 'enable') {
    const body = { name: sub };
    if (write) await api(`/zones/${zone.id}/email/routing/dns`, { method: 'POST', body });
    console.log(`routing: ${pre}enable on ${sub}`);
    changes += 1;
  }

  if (write) {
    const after = await listRecords(api, zone.id);
    if (mailChanged(after, desired)) throw new Error('apex MX or SPF changed: restore them now');
    if (!isEmpty(dnsPlan(after, desired, sub))) throw new Error(`records changed outside ${sub}`);
  }
  if (!changes) console.log('zone: no change');
};

module.exports = {
  ZONE,
  DESIRED_SETTINGS,
  DESIRED_ADDRESSES,
  readRecords,
  sendingDomain,
  recordKey,
  isManaged,
  dnsPlan,
  settingsPlan,
  addressPlan,
  routingPlan,
  mailChanged,
  run,
};
