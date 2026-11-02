const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MARK, loadLanding, checkLanding, pruneLanding,
} = require('../build/lib/landing');
const { renderPages, writePages } = require('../build/lib/pages');
const { readManifest } = require('../build/lib/images');
const { sitemap, writeRedirects } = require('../build-news');

const ROOT = path.join(__dirname, '..');
const IMAGE = '/wp-content/uploads/2024/01/Untitled-design-1.jpg';
const BODY = `Intro **bold**, *italic*, [link](/contact/).

## Two

### Three

#### Four

- One
- Two

> Quote

---

![Alt](${IMAGE} "A title")`;

function tempSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-'));
  Object.entries({ 'build/redirects.txt': '', ...files }).forEach(([file, text]) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  });
  return dir;
}

const md = (fields, body = 'Text') => `---\n${fields.join('\n')}\n---\n${body}\n`;
const entry = (slug, filename = slug) => md([`slug: ${slug}`, 'h1: Dubai Villas'], filename);
const page = (slug, extra) => ({ [`content/landing/${slug}.md`]: entry(slug), ...extra });

/* The real site files, with the landing files of the temp folder. */
function renderLanding(fields, body = BODY) {
  const dir = tempSite({ 'content/landing/villas.md': md(fields, body) });
  const landing = loadLanding(dir);
  const pages = renderPages(ROOT, '/news/', undefined, null, readManifest(ROOT), landing);
  return { pages, landing, html: pages.find((p) => p.slug === landing[0].slug).html };
}

const LD = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g;
const ldJson = (html) => [...html.matchAll(LD)].map((m) => JSON.parse(m[1]));

test('a missing content/landing/ gives no pages', () => {
  assert.deepEqual(loadLanding(tempSite({})), []);
});

test('a landing page has the chrome, one visible title and every block', () => {
  const { html } = renderLanding(['slug: villas', 'h1: Dubai Villas']);
  assert.ok(html.startsWith(`${MARK}<!DOCTYPE html>`));
  assert.ok(!html.includes('{{'));
  assert.match(html, /<h1>Dubai Villas<\/h1>/);
  assert.match(html, /<footer class="footer"/);
  const crumb = html.match(/<nav class="projectBreadcrumbs".*?<\/nav>/)[0];
  assert.equal(crumb.replace(/<[^>]*>/g, ''), 'Home › Dubai Villas');
  ['<strong>bold</strong>', '<em>italic</em>', '<a href="/contact/">', '<h2 id="two">',
    '<h3 id="three">', '<h4 id="four">', '<ul><li>One</li>', '<blockquote>Quote</blockquote>',
    '<hr />'].forEach((part) => assert.ok(html.includes(part), part));
});

test('an image with a title keeps a clean src and goes through picture()', () => {
  const { html } = renderLanding(['slug: villas', 'h1: Dubai Villas']);
  assert.ok(!html.includes('A%20title'));
  assert.match(html, /<source type="image\/avif"[^>]*>/);
  assert.match(html, /alt="Alt" decoding="async" loading="lazy"/);
});

test('a landing page fills the head tags from the flat fields', () => {
  const { html } = renderLanding([
    'slug: villas', 'h1: Dubai Villas', 'seo_title: SEO T', 'og_title: Social T',
    'description: Meta D', 'canonical: https://nellisarchitecture.com/other/',
  ]);
  assert.ok(html.includes('<title>SEO T</title>'));
  assert.ok(html.includes('<meta property="og:title" content="Social T" />'));
  assert.ok(html.includes('<meta name="description" content="Meta D" />'));
  assert.ok(html.includes('<link rel="canonical" href="https://nellisarchitecture.com/other/" />'));
});

test('the generated schema is one WebPage and one BreadcrumbList under Home', () => {
  const { html } = renderLanding(['slug: villas', 'h1: Dubai Villas', 'description: D']);
  const [{ '@graph': graph }] = ldJson(html);
  assert.deepEqual(graph.map((n) => n['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(graph[0].url, 'https://nellisarchitecture.com/villas/');
  assert.equal(graph[0].name, 'Dubai Villas');
  assert.deepEqual(graph[1].itemListElement.map((i) => [i.position, i.name]), [
    [1, 'Home'], [2, 'Dubai Villas'],
  ]);
});

test('the custom schema follows the generated schema; bad JSON names the file', () => {
  const schema = 'schema: "{\\"@type\\":\\"FAQPage\\"}"';
  const { html } = renderLanding(['slug: villas', 'h1: T', schema]);
  assert.equal(ldJson(html)[1]['@type'], 'FAQPage');
  assert.throws(
    () => renderLanding(['slug: villas', 'h1: T', 'schema: nope']),
    /content\/landing\/villas\.md: schema is not valid JSON/,
  );
});

test('the sitemap lists a landing page and skips a noindex page', () => {
  const on = renderLanding(['slug: villas', 'h1: T']);
  const off = renderLanding(['slug: villas', 'h1: T', 'noindex: true']);
  const url = '<loc>https://nellisarchitecture.com/villas/</loc><priority>0.6</priority>';
  assert.ok(sitemap([], on.pages).includes(url));
  assert.ok(!sitemap([], off.pages).includes('/villas/'));
  assert.match(off.html, /<meta name="robots" content="noindex">/);
});

test('a bad or duplicate slug fails', () => {
  ['Bad_Slug', '-x', 'a/b', '../x', ''].forEach((slug) => {
    const dir = tempSite({ 'content/landing/x.md': md([`slug: ${slug}`, 'h1: T']) });
    assert.throws(() => loadLanding(dir), /content\/landing\/x\.md: slug must be/, slug);
  });
  const dir = tempSite({ 'content/landing/a.md': entry('x'), 'content/landing/b.md': entry('x') });
  assert.throws(() => loadLanding(dir), /content\/landing\/b\.md: duplicate slug "x"/);
});

test('a slug that hits a root entry, a reserved name or a fixed rule fails', () => {
  const site = {
    'index.html': '',
    '404.html': '',
    'studio/index.html': '',
    'admin/config.yml': '',
    'build/redirects.txt': '/rss/ /feed/ 301\n/page/* / 301\n',
  };
  [['studio', /uses/], ['admin', /uses/], ['index', /uses/], ['404', /uses/], ['build', /uses/],
    ['api', /uses/], ['cdn-cgi', /uses/], ['deployment-logs', /uses/],
    ['rss', /matches a rule in build\/redirects\.txt/],
    ['page', /matches a rule in build\/redirects\.txt/],
  ].forEach(([slug, why]) => {
    const dir = tempSite({ ...site, ...page(slug) });
    assert.throws(() => checkLanding(dir, loadLanding(dir)), why, slug);
  });
});

test('a collision stops writePages before a write', () => {
  const dir = tempSite(page('studio', { 'studio/index.html': 'old' }));
  assert.throws(() => writePages(dir, '/news/', [], [], {}), /slug "studio"/);
  assert.equal(fs.readFileSync(path.join(dir, 'studio/index.html'), 'utf8'), 'old');
});

test('the own marked folder is not a collision', () => {
  const dir = tempSite(page('villas', { 'villas/index.html': `${MARK}<!DOCTYPE html>` }));
  checkLanding(dir, loadLanding(dir));
});

test('a changed slug gets a 301 and loses the stale marked folder', () => {
  const dir = tempSite({
    'content/landing/old.md': entry('new'),
    'content/redirects.json': '{"redirects":[]}',
    'old/index.html': `${MARK}<!DOCTYPE html>`,
    'new/index.html': `${MARK}<!DOCTYPE html>`,
  });
  const landing = loadLanding(dir);
  pruneLanding(dir, landing);
  assert.ok(!fs.existsSync(path.join(dir, 'old')));
  assert.ok(fs.existsSync(path.join(dir, 'new/index.html')));
  writeRedirects(dir, [], landing);
  const out = fs.readFileSync(path.join(dir, '_redirects'), 'utf8');
  assert.ok(out.includes('/old /new/ 301\n/old/ /new/ 301\n'));
});

test('a manual rule wins over the auto rule', () => {
  const dir = tempSite({
    'content/landing/old.md': entry('new'),
    'content/redirects.json': '{"redirects":[{"from":"/old/","to":"/"}]}',
    'index.html': '',
    'new/index.html': '',
  });
  writeRedirects(dir, [], loadLanding(dir));
  const out = fs.readFileSync(path.join(dir, '_redirects'), 'utf8');
  assert.ok(out.includes('/old/ / 301'));
  assert.ok(!out.includes('/old/ /new/'));
});

test('a CMS redirect from a live landing page fails', () => {
  const dir = tempSite({
    'content/landing/villas.md': entry('villas'),
    'content/redirects.json': '{"redirects":[{"from":"/villas/","to":"/"}]}',
    'index.html': '',
    'villas/index.html': '',
  });
  assert.throws(() => writeRedirects(dir, [], loadLanding(dir)), /is a live page or file/);
});

test('prune keeps an unmarked folder, an owned folder and a folder with no index.html', () => {
  const dir = tempSite({
    'hand/index.html': '<!DOCTYPE html>',
    'owned/index.html': MARK,
    'stale/index.html': MARK,
    'assets/a.txt': '',
  });
  pruneLanding(dir, [{ slug: 'owned' }]);
  ['hand', 'owned', 'assets'].forEach((d) => assert.ok(fs.existsSync(path.join(dir, d)), d));
  assert.ok(!fs.existsSync(path.join(dir, 'stale')));
});

test('the CMS collection names h1 as its identifier and has no delete', () => {
  const config = fs.readFileSync(path.join(ROOT, 'admin', 'config.yml'), 'utf8');
  const start = config.indexOf('name: "landing"');
  const block = config.slice(start, config.indexOf('name: "redirects"'));
  ['identifier_field: h1', 'delete: false', 'folder: "content/landing"',
    'media_folder: "/wp-content/uploads/pages"', 'public_folder: "/wp-content/uploads/pages"',
    'Retire with noindex.'].forEach((line) => assert.ok(block.includes(line), line));
});
