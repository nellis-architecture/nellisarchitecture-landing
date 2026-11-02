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
const TEXTS = ['text_1', 'text_2', 'text_3'];
const IMAGE_LISTS = ['slider_1', 'image_2', 'slider_2', 'last_images'];
const UPLOADS = '/wp-content/uploads/';
/* The image extensions of REF in images.js, and the video of heroVideo(). */
const HERO = /\.(jpe?g|png|webp|mp4)$/i;

const categoryHref = (cat) => `/projects/${cat}/`;

const inCategory = (entry, cat) => entry.cat === cat || (entry.p.also_in || []).includes(cat);

/* The image of a filter item, a category card and data/search.json. */
const listImage = (entry) => entry.p.list_image || entry.p.card_image;

const cardAlt = (entry) => entry.p.card_alt || entry.name;

function check(p, source) {
  const fail = (why) => {
    throw new Error(`${source}: ${why}`);
  };
  if (!p || typeof p !== 'object') fail('must be a JSON object');
  REQUIRED.filter((k) => typeof p[k] !== 'string' || !p[k].trim())
    .forEach((k) => fail(`${k} is required`));
  if (!Number.isFinite(p.order)) fail(`order must be a number: "${p.order}"`);
  if (!SLUG.test(p.slug)) {
    fail(`slug must be lowercase letters, digits and dashes: "${p.slug}"`);
  }
  if (!CATEGORY_KEYS.includes(p.category)) fail(`unknown category "${p.category}"`);
  if (!TYPES.includes(p.type)) fail(`unknown type "${p.type}"`);
  /* Falsy is an empty list, as in the page generator: the CMS can write "" or null. */
  ['also_in', 'facts', ...TEXTS, ...IMAGE_LISTS].filter((k) => p[k] && !Array.isArray(p[k]))
    .forEach((k) => fail(`${k} must be a list`));
  const items = (k) => p[k] || [];
  const isText = (s) => typeof s === 'string';
  const upload = (k, src) => {
    if (!String(src).startsWith(UPLOADS)) fail(`${k} must start with ${UPLOADS}: "${src}"`);
  };
  (p.also_in || []).filter((cat) => !CATEGORY_KEYS.includes(cat))
    .forEach((cat) => fail(`unknown also_in category "${cat}"`));
  TEXTS.filter((k) => !items(k).every(isText))
    .forEach((k) => fail(`${k} items must be text`));
  if (!items('facts').every((f) => isText(f?.label) && isText(f?.value))) {
    fail('facts items need label and value');
  }
  upload('hero', p.hero);
  if (!HERO.test(p.hero)) fail(`hero must be an image or an mp4: "${p.hero}"`);
  upload('card_image', p.card_image);
  if (p.list_image) upload('list_image', p.list_image);
  IMAGE_LISTS.forEach((k) => items(k).forEach((item) => {
    if (!item?.src) fail(`${k} items need src`);
    upload(`${k} src`, item.src);
  }));
  if (![true, false, undefined].includes(p.seo?.noindex)) {
    fail(`seo.noindex must be true or false: "${p.seo.noindex}"`);
  }
}

function parse(file, source) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${source}: not valid JSON (${err.message})`);
  }
}

/* content/projects/<filename>.json, sorted by order, then by name. Reads only through fs:
   the CMS preview runs it on the virtual fs. */
function loadProjects(root) {
  const dir = path.join(root, 'content', 'projects');
  const urls = new Set();
  const names = new Set();
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const source = `content/projects/${f}`;
    const p = parse(path.join(dir, f), source);
    check(p, source);
    const url = `/projects/${p.category}/${p.slug}/`;
    if (urls.has(url)) throw new Error(`${source}: duplicate URL ${url}`);
    const key = p.name.toLowerCase();
    if (names.has(key)) throw new Error(`${source}: duplicate name "${p.name}"`);
    urls.add(url);
    names.add(key);
    return {
      name: p.name, p, slug: p.slug, cat: p.category, url, filename: f.slice(0, -5),
    };
  }).sort((x, y) => x.p.order - y.p.order || x.name.localeCompare(y.name));
}

/* Build only: the virtual fs of the CMS preview has no uploads. */
function checkUploads(root, list) {
  list.forEach(({ p, filename }) => {
    const slides = IMAGE_LISTS.flatMap((k) => (p[k] || []).map((item) => item.src));
    [p.hero, p.card_image, p.list_image, ...slides].filter(Boolean)
      .filter((src) => !fs.existsSync(path.join(root, src)))
      .forEach((src) => {
        throw new Error(`content/projects/${filename}.json: file not found: ${src}`);
      });
  });
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
  checkUploads,
  hashTarget,
  earlyScript,
  description,
};
