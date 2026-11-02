const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zone = require('./zone');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://api.cloudflare.com/client/v4';
const DOCS = 'docs/workflow/development.md → Hosting — Cloudflare Workers → Setup as code';

const DESIRED = {
  production: {
    branch_includes: ['master'],
    branch_excludes: [],
    build_command: 'npm run build',
    deploy_command: 'npm run deploy',
    root_directory: '/',
    build_caching_enabled: true,
  },
  variables: { SKIP_DEPENDENCY_INSTALL: '1' },
  turnstile: {
    name: 'landing',
    domains: ['landing.nellisarchitecture.workers.dev', 'nellisarchitecture.com'],
    mode: 'managed',
  },
};

// wrangler.jsonc has no comments, so JSON.parse reads it. Upgrade: strip comments if one is added.
const wrangler = (root) => JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
const workerName = (root = ROOT) => wrangler(root).name;
const bucketName = (root = ROOT) => wrangler(root).r2_buckets[0].bucket_name;

const bucketPlan = (list, name) => (list.some((b) => b.name === name) ? 'none' : 'create');

// Never rotate LINK_SECRET: a new value breaks the file links in sent emails.
const linkSecretPlan = (secrets) => (
  secrets.some((s) => s.name === 'LINK_SECRET') ? 'none' : 'create');

const OAUTH = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];

// Values come from the shell (bootstrap). Without them, keep what the Worker has.
const oauthSecretPlan = (secretNames, env) => {
  const given = OAUTH.filter((key) => env[key]);
  if (given.length === OAUTH.length) return 'set';
  if (given.length) throw new Error(`Set both ${OAUTH.join(' and ')}, or neither. See ${DOCS}.`);
  return OAUTH.every((key) => secretNames.includes(key)) ? 'keep' : 'missing';
};

const pickProduction = (list, branch) => {
  const match = list.find((t) => (t.branch_includes || []).includes(branch));
  if (match) return match;
  if (list.length === 1) return list[0];
  throw new Error(`${list.length} triggers, none for branch "${branch}". Check the dashboard.`);
};

const extraTriggers = (list, prod) => list.filter((t) => t.trigger_uuid !== prod.trigger_uuid);

// live: the API result, a map { KEY: { value, is_secret, created_on } }. Secret values are null.
const varsPlan = (live, desired) => {
  if (Array.isArray(live)) throw new Error('environment_variables: expected a map, got an array');
  const set = {};
  Object.entries(desired).forEach(([key, value]) => {
    const now = live[key];
    if (!now || now.value !== value || now.is_secret) set[key] = { value, is_secret: false };
  });
  const remove = Object.keys(live).filter((key) => !(key in desired));
  return { set, remove };
};

const widgetPlan = (list, desired) => {
  const live = list.find((w) => w.name === desired.name);
  if (!live) return 'create';
  const same = live.mode === desired.mode
    && live.domains.length === desired.domains.length
    && desired.domains.every((d) => live.domains.includes(d));
  return same ? 'none' : 'update';
};

const api = async (urlPath, { method = 'GET', body } = {}) => {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- runs on Node 24 (.nvmrc)
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const errors = JSON.stringify(json.errors || []);
    throw new Error(`${method} ${urlPath}: HTTP ${res.status} ${errors}`);
  }
  return json.result;
};

const main = async () => {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: acct } = process.env;
  if (!token || !acct) {
    throw new Error(`Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. See ${DOCS}.`);
  }
  if (process.argv.includes('--plan')) {
    await zone.run({ api, acct, write: false });
    return;
  }
  const bucket = bucketName();
  const { buckets } = await api(`/accounts/${acct}/r2/buckets`);
  if (bucketPlan(buckets, bucket) === 'create') {
    await api(`/accounts/${acct}/r2/buckets`, { method: 'POST', body: { name: bucket } });
    console.log(`r2: bucket ${bucket} created`);
  } else {
    console.log(`r2: bucket ${bucket} exists`);
  }

  const name = workerName();
  const scripts = await api(`/accounts/${acct}/workers/scripts`);
  const script = scripts.find((s) => s.id === name);
  if (!script) throw new Error(`Worker "${name}" not found. Do the bootstrap first: ${DOCS}.`);
  const list = await api(`/accounts/${acct}/builds/workers/${script.tag}/triggers`);
  const prod = pickProduction(list, DESIRED.production.branch_includes[0]);
  const uuid = prod.trigger_uuid;

  const secretsPath = `/accounts/${acct}/workers/scripts/${name}/secrets`;
  const secrets = await api(secretsPath);
  if (linkSecretPlan(secrets) === 'create') {
    const text = crypto.randomBytes(32).toString('base64url');
    const secret = { name: 'LINK_SECRET', text, type: 'secret_text' };
    await api(secretsPath, { method: 'PUT', body: secret });
    console.log(`Worker ${name}: secret LINK_SECRET set`);
  } else {
    console.log(`Worker ${name}: secret LINK_SECRET exists, not changed`);
  }

  const oauth = oauthSecretPlan(secrets.map((s) => s.name), process.env);
  if (oauth === 'set') {
    await OAUTH.reduce((chain, key) => chain.then(async () => {
      const secret = { name: key, text: process.env[key], type: 'secret_text' };
      await api(secretsPath, { method: 'PUT', body: secret });
      console.log(`Worker ${name}: secret ${key} set`);
    }), Promise.resolve());
  } else if (oauth === 'keep') {
    console.log(`Worker ${name}: secrets ${OAUTH.join(', ')} exist, not changed`);
  } else {
    console.log(`WARNING: Worker ${name} has no ${OAUTH.join(' / ')}. The CMS login answers 503.`);
    console.log(`Create the GitHub OAuth App and set both values: ${DOCS} → Bootstrap.`);
  }

  const want = DESIRED.turnstile;
  const widgetsPath = `/accounts/${acct}/challenges/widgets`;
  const widgets = await api(widgetsPath);
  const plan = widgetPlan(widgets, want);
  const current = widgets.find((w) => w.name === want.name);
  const widgetPath = current && `${widgetsPath}/${current.sitekey}`;
  const widget = await {
    create: () => api(widgetsPath, { method: 'POST', body: want }),
    update: () => api(widgetPath, { method: 'PUT', body: want }),
    none: () => api(widgetPath),
  }[plan]();
  console.log(`turnstile: ${plan}; sitekey ${widget.sitekey}`);
  if (widget.secret) {
    await api(secretsPath, {
      method: 'PUT',
      body: { name: 'TURNSTILE_SECRET', text: widget.secret, type: 'secret_text' },
    });
    console.log(`Worker ${name}: secret TURNSTILE_SECRET set`);
  } else {
    console.log('turnstile: the API answer has no secret.');
    console.log('Set it by hand: npx wrangler secret put TURNSTILE_SECRET');
  }

  const body = DESIRED.production;
  await api(`/accounts/${acct}/builds/triggers/${uuid}`, { method: 'PATCH', body });
  console.log(`trigger ${uuid}: set ${JSON.stringify(body)}`);

  await extraTriggers(list, prod).reduce((chain, t) => chain.then(async () => {
    await api(`/accounts/${acct}/builds/triggers/${t.trigger_uuid}`, { method: 'DELETE' });
    console.log(`trigger ${t.trigger_uuid}: deleted`);
  }), Promise.resolve());

  const varsPath = `/accounts/${acct}/builds/triggers/${uuid}/environment_variables`;
  const live = await api(varsPath) || {};
  const vars = { ...DESIRED.variables, TURNSTILE_SITEKEY: widget.sitekey };
  const { set, remove } = varsPlan(live, vars);
  if (Object.keys(set).length) {
    await api(varsPath, { method: 'PATCH', body: set });
    console.log(`variables: set ${Object.keys(set).join(', ')}`);
  }
  await remove.reduce((chain, key) => chain.then(async () => {
    await api(`${varsPath}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const note = live[key].is_secret ? ' (secret, value is lost)' : '';
    console.log(`variables: deleted ${key}${note}`);
  }), Promise.resolve());
  console.log('Cloudflare build settings are up to date.');
  await zone.run({ api, acct, write: true });
};

module.exports = {
  DESIRED,
  workerName,
  bucketName,
  bucketPlan,
  linkSecretPlan,
  oauthSecretPlan,
  pickProduction,
  extraTriggers,
  varsPlan,
  widgetPlan,
  api,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
