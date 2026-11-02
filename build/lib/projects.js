/* eslint no-unused-vars: ["error", { "caughtErrors": "none" }] -- see hashTarget */
const fs = require('node:fs');
const path = require('node:path');
const { SLUG } = require('./markdown');

const CATEGORIES = {
  architecture: { label: 'Architecture' },
  'interior-design': { label: 'Interior Design' },
  landscape: { label: 'Landscape' },
  'master-planning': { label: 'Master Planning' },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);
const TYPES = ['residential', 'commercial'];
const REQUIRED = ['name', 'slug', 'category', 'type', 'hero', 'card_image'];

const categoryHref = (cat) => `/projects/${cat}/`;

const inCategory = (entry, cat) => entry.cat === cat || (entry.p.also_in || []).includes(cat);

/* The image of a filter item, a category card and data/search.json. */
const listImage = (entry) => entry.p.list_image || entry.p.card_image;

const cardAlt = (entry) => entry.p.card_alt || entry.name;

function check(p, source) {
  const fail = (why) => {
    throw new Error(`${source}: ${why}`);
  };
  REQUIRED.filter((k) => typeof p[k] !== 'string' || !p[k].trim())
    .forEach((k) => fail(`${k} is required`));
  if (!Number.isFinite(p.order)) fail(`order must be a number: "${p.order}"`);
  if (!SLUG.test(p.slug)) {
    fail(`slug must be lowercase letters, digits and dashes: "${p.slug}"`);
  }
  if (!CATEGORY_KEYS.includes(p.category)) fail(`unknown category "${p.category}"`);
  if (!TYPES.includes(p.type)) fail(`unknown type "${p.type}"`);
  (p.also_in || []).filter((cat) => !CATEGORY_KEYS.includes(cat))
    .forEach((cat) => fail(`unknown also_in category "${cat}"`));
}

/* content/projects/<filename>.json, sorted by order, then by name. Reads only through fs:
   the CMS preview runs it on the virtual fs. */
function loadProjects(root) {
  const dir = path.join(root, 'content', 'projects');
  const urls = new Set();
  const names = new Set();
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const source = `content/projects/${f}`;
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    check(p, source);
    const url = `/projects/${p.category}/${p.slug}/`;
    if (urls.has(url)) throw new Error(`${source}: duplicate URL ${url}`);
    if (names.has(p.name)) throw new Error(`${source}: duplicate name "${p.name}"`);
    urls.add(url);
    names.add(p.name);
    return {
      name: p.name, p, slug: p.slug, cat: p.category, url, filename: f.slice(0, -5),
    };
  }).sort((x, y) => x.p.order - y.p.order || x.name.localeCompare(y.name));
}

/* Runs in the browser too (earlyScript): keep it self-contained ES2015.
   #proj=<Name> -> map. Any other hash -> cats (old /#<category> filter
   links), only when cats is passed. Bad encoding (URIError) means no target. */
function hashTarget(hash, map, cats) {
  if (typeof hash !== 'string' || hash.charAt(0) !== '#') return null;
  const proj = hash.indexOf('#proj=') === 0;
  if (!proj && !cats) return null;
  let name;
  try {
    name = decodeURIComponent(hash.slice(proj ? 6 : 1)).trim().toLowerCase();
  } catch (err) {
    return null;
  }
  const table = proj ? map : cats;
  const key = Object.keys(table).find((k) => k.toLowerCase() === name);
  return key ? table[key] : null;
}

/* Home only: sends old /#proj=<Name> links (also theme search results,
   which set the hash) to the project page, and old /#<category> links
   (on load only) to the category page.
   replace(): no history entry. */
function earlyScript(list) {
  const map = Object.fromEntries(list.map((e) => [e.name, e.url]));
  const cats = Object.fromEntries(CATEGORY_KEYS.map((k) => [
    CATEGORIES[k].label.toLowerCase(), categoryHref(k),
  ]));
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return [
    '  <script>',
    '    (function () {',
    `      var map = ${json(map)};`,
    `      var cats = ${json(cats)};`,
    `      ${hashTarget}`,
    '      function go(c) {',
    '        var url = hashTarget(location.hash, map, c);',
    '        if (url) location.replace(url);',
    '      }',
    '      go(cats);',
    "      window.addEventListener('hashchange', function () { go(); });",
    '    }());',
    '  </script>',
    '',
  ].join('\n');
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] || m;
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/* Plain text from the project HTML, cut at a word boundary. Not escaped. */
function description(html, max = 155) {
  const text = decodeEntities(String(html || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const end = cut.lastIndexOf(' ');
  return (end > 0 ? cut.slice(0, end) : text.slice(0, max)).replace(/[\s,;:]+$/, '');
}

module.exports = {
  CATEGORIES,
  CATEGORY_KEYS,
  categoryHref,
  inCategory,
  listImage,
  cardAlt,
  loadProjects,
  hashTarget,
  earlyScript,
  description,
};
