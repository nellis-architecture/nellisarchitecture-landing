/* Live check: every URL in the live WordPress sitemaps (pages and images) must answer on
   the new site, and the head of each news post is compared with live. Run it before the
   cutover: npm run check:live (the new site is workers.dev), or
   npm run check:live -- --base http://localhost:8000 (the local preview).
   Exit code 1 when a URL is missing; head differences are a report only. */
const LIVE = 'https://nellisarchitecture.com';
const DEFAULT_BASE = 'https://landing.nellisarchitecture.workers.dev';
const LANES = 6;
/* The live host blocks requests without a browser user agent. */
const HEADERS = { 'user-agent': 'Mozilla/5.0 (nellis live-check)' };

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);

const clean = (s) => decode(s || '').replace(/\s+/g, ' ').trim();

/* The text of each <tag> element in a sitemap, entities decoded. */
const locs = (xml, tag = 'loc') => [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))]
  .map((m) => decode(m[1].trim()));

/* The path of a URL with its query, so it can be requested on another host. */
const pathOf = (url) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

const metaContent = (head, attr, name) => {
  const tag = head.match(new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*>`, 'i'));
  const content = tag && tag[0].match(/content=(?:"([^"]*)"|'([^']*)')/i);
  return content ? clean(content[1] ?? content[2]) : '';
};

/* The SEO fields of a page: <title>, meta description and og:title from the <head>.
   HTML comments are dropped first: the live theme keeps an empty <title> in one. */
const headOf = (html) => {
  const head = html.split(/<\/head>/i)[0].replace(/<!--[\s\S]*?-->/g, '');
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    title: title ? clean(title[1]) : '',
    description: metaContent(head, 'name', 'description'),
    ogTitle: metaContent(head, 'property', 'og:title'),
  };
};

/* One trailing " | Nellis Architecture" or " - Nellis Architecture". */
const unbrand = (s) => s.replace(/\s+[|\-–]\s+Nellis Architecture$/, '');

/* The fields whose text differs between the live head and the new head. `brand` is true
   when the two differ only by the site name at the end. */
const headDiff = (live, local) => Object.keys(live)
  .filter((key) => live[key] !== local[key])
  .map((key) => ({
    key, live: live[key], local: local[key], brand: unbrand(live[key]) === unbrand(local[key]),
  }));

/* Run fn over items, no more than `size` at a time. The results keep the item order. */
const pool = (items, size, fn) => {
  const out = new Array(items.length);
  const lanes = Array.from({ length: size }, (unused, lane) => items
    .map((item, i) => [item, i])
    .filter(([, i]) => i % size === lane)
    .reduce((chain, [item, i]) => chain.then(async () => {
      out[i] = await fn(item);
    }), Promise.resolve()));
  return Promise.all(lanes).then(() => out);
};

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/* A network error (not an HTTP status) is tried again, up to `tries` times. */
const get = async (url, method = 'GET', tries = 3) => {
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- runs on Node 24 (.nvmrc)
    return await fetch(url, { method, headers: HEADERS, redirect: 'follow' });
  } catch (err) {
    if (tries <= 1) throw new Error(`${err.message}: ${method} ${url}`, { cause: err });
    await wait(1000);
    return get(url, method, tries - 1);
  }
};

const text = async (url) => {
  const res = await get(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};

/* Every page and image URL in the live sitemap index, without duplicates. No page URL
   means the host answered something else (for example a bot challenge): fail, so the
   check cannot pass with an empty list. */
async function liveUrls(live = LIVE, read = text) {
  const maps = locs(await read(`${live}/sitemap_index.xml`));
  const xmls = await pool(maps, LANES, read);
  const pages = new Set(xmls.flatMap((xml) => locs(xml)));
  const images = new Set(xmls.flatMap((xml) => locs(xml, 'image:loc')));
  if (!pages.size) throw new Error(`no page URLs in the sitemaps of ${live}`);
  return { pages: [...pages], images: [...images] };
}

/* The status of each URL path on the new site, after redirects. */
const statusOf = async (base, url) => {
  const res = await get(`${base}${pathOf(url)}`, 'HEAD');
  return { path: pathOf(url), status: res.status };
};

const isPost = (url) => /^\/news\/[^/]+\/$/.test(pathOf(url));

async function check(base, live = LIVE) {
  const { pages, images } = await liveUrls(live);
  const statuses = await pool([...pages, ...images], LANES, (url) => statusOf(base, url));
  const missing = statuses.filter((s) => s.status !== 200);
  const posts = pages.filter(isPost);
  const diffs = (await pool(posts, LANES, async (url) => {
    const [liveHtml, localRes] = await Promise.all([text(url), get(`${base}${pathOf(url)}`)]);
    if (!localRes.ok) return null;
    const fields = headDiff(headOf(liveHtml), headOf(await localRes.text()));
    return fields.length ? { path: pathOf(url), fields } : null;
  })).filter(Boolean);
  return {
    pages: pages.length, images: images.length, posts: posts.length, missing, diffs,
  };
}

function report(base, r) {
  const fields = r.diffs.flatMap((d) => d.fields.map((f) => ({ ...f, path: d.path })));
  const brand = fields.filter((f) => f.brand);
  const wording = r.diffs
    .map((d) => ({ path: d.path, fields: d.fields.filter((f) => !f.brand) }))
    .filter((d) => d.fields.length);
  const lines = [
    `Live sitemaps: ${r.pages} pages, ${r.images} images. New site: ${base}`,
    '',
    `Missing on the new site (${r.missing.length}):`,
    ...r.missing.map((m) => `  ${m.status} ${m.path}`),
    '',
    `News head fields that differ only by the site name at the end: ${brand.length}`,
    '',
    `News head text differences (${wording.length} of ${r.posts} posts):`,
  ];
  wording.forEach((d) => {
    lines.push(`  ${d.path}`);
    d.fields.forEach((f) => {
      lines.push(`    ${f.key}`, `      live: ${f.live}`, `      new:  ${f.local}`);
    });
  });
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf('--base');
  if (at >= 0 && !argv[at + 1]) {
    throw new Error('--base needs a URL, for example http://localhost:8000');
  }
  const base = (at >= 0 ? argv[at + 1] : DEFAULT_BASE).replace(/\/+$/, '');
  const result = await check(base);
  console.log(report(base, result));
  return result.missing.length ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }, (err) => {
    console.error(err.message);
    process.exitCode = 2;
  });
}

module.exports = {
  decode, locs, pathOf, headOf, headDiff, pool, isPost, report, liveUrls, main,
};
