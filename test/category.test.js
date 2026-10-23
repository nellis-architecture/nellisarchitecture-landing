const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const category = require('../build/lib/pages/category');
const { PAGES, renderPages } = require('../build/lib/pages');
const { loadProjects, CATEGORY_KEYS, inCategory } = require('../build/lib/projects');
const { sitemap } = require('../build-news');
const { originalOf, readManifest } = require('../build/lib/images');
const { ORGANIZATION } = require('../build/lib/seo');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://nellisarchitecture.com';
const LIST = loadProjects(ROOT);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pages', 'site.json'), 'utf8'));
const names = (cat) => category.members(LIST, cat).map((e) => e.name);
const count = (s, sub) => s.split(sub).length - 1;
const pageOf = (cat) => PAGES.find((p) => p.category === cat);
const render = (content, cat = 'landscape', projects = LIST) => category.render(content, {
  site, newsHref: '/news/n/', page: pageOf(cat), root: ROOT, projects,
});
const fixture = (seo = {}) => ({
  h1: 'H1 <a> & "q"', intro: 'Intro <b> & "q" $&', seo: { description: 'D', ...seo },
});

test('each category lists its primary and secondary projects', () => {
  assert.deepEqual(
    CATEGORY_KEYS.map((cat) => [cat, names(cat).length]),
    [['architecture', 25], ['interior-design', 3], ['landscape', 9], ['master-planning', 5]],
  );
  assert.ok(names('landscape').includes('Zoya'));
  assert.deepEqual(names('interior-design'), ['Lumeria', 'Soul', 'Solari']);
  assert.ok(names('architecture').includes('Soul'));
  ['Skye Residences', 'Evergreens Hotel', 'WEST LINKS'].forEach((name) => {
    assert.ok(!names('architecture').includes(name), name);
    assert.ok(names('master-planning').includes(name), name);
  });
});

test('the list keeps the data/projects.json order', () => {
  const all = LIST.map((e) => e.name);
  CATEGORY_KEYS.forEach((cat) => {
    const at = names(cat).map((n) => all.indexOf(n));
    assert.deepEqual([...at].sort((a, b) => a - b), at, cat);
  });
});

test('an empty category throws', () => {
  assert.throws(() => category.members([], 'landscape'), /projects\/landscape\/: no project/);
  const noLandscape = LIST.map((e) => ({ ...e, p: { ...e.p, res2: [e.p.res2[0]] } }));
  assert.throws(() => render(fixture(), 'landscape', noLandscape), /no project/);
});

test('location skips an empty area line and escapes text', () => {
  assert.equal(
    category.location({ project_rigth1: 'Palm & <J>', project_rigth2: 'Dubai' }),
    `Palm &amp; &lt;J&gt; <br>\n${' '.repeat(28)}Dubai`,
  );
  assert.equal(category.location({ project_rigth1: '', project_rigth2: 'D, U' }), 'D, U');
  assert.equal(category.location({ project_rigth1: ' ', project_rigth2: 'X' }), 'X');
  assert.equal(category.location({}), '');
});

test('each item links to the project page in its primary category', () => {
  const html = render(fixture());
  assert.equal(count(html, '<div class="project__item">'), 9);
  assert.ok(html.includes('<a class="project__link" href="/projects/architecture/zoya/" '
    + 'aria-label="Zoya"></a>'));
  assert.ok(html.includes('href="/projects/master-planning/orel/"'));
  assert.ok(html.includes('src="/wp-content/variants/2025/07/Zoya1-scaled-f4a51325-1600.jpg"'));
  assert.equal(count(html, 'fetchpriority="high"'), 1);
  assert.ok(html.split('fetchpriority')[0].includes('aria-label="Zoya"'));
  const atelier = render(fixture(), 'architecture').split('aria-label="Atelier"')[1]
    .split('</div>')[0];
  assert.ok(!atelier.includes('<br>'));
  assert.ok(atelier.includes('Dubai, UAE'));
});

test('category page escapes the CMS text', () => {
  const html = render(fixture({ title: 'T <x> & "q"', description: 'D <x> & "q"' }));
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes('<h1 class="visually-hidden">H1 &lt;a&gt; &amp; "q"</h1>'));
  assert.ok(html.includes('<h2 class="categoryTitle">H1 &lt;a&gt; &amp; "q"</h2>'));
  assert.ok(html.includes('<p class="categoryIntro">Intro &lt;b&gt; &amp; "q" $&amp;</p>'));
  assert.ok(html.includes('<title>T &lt;x&gt; &amp; "q"</title>'));
  assert.ok(html.includes('<meta name="description" content="D &lt;x&gt; &amp; &quot;q&quot;" />'));
  assert.ok(!html.includes('"name":"T <x>'));
});

test('category page head has its own SEO tags and an absolute og:image', () => {
  const url = `${DOMAIN}/projects/landscape/`;
  const html = render(fixture({ title: 'T' }));
  assert.ok(html.includes('<title>T</title>'));
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.equal(count(html, 'property="og:image"'), 1);
  assert.ok(html.includes(`<meta property="og:image" content="${DOMAIN}`
    + '/wp-content/uploads/2025/07/Zoya1-scaled.jpg">'));
  assert.ok(!html.includes('article:modified_time'));
  assert.ok(html.includes("<meta name='robots' content='index, follow"));
});

test('category page keeps a custom canonical and supports noindex', () => {
  const canonical = `${DOMAIN}/projects/other/`;
  const html = render(fixture({ canonical, noindex: true }));
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  const pages = [{ slug: 'projects/landscape', priority: '0.7', noindex: true }];
  assert.ok(!sitemap([], pages).includes('/projects/landscape/'));
});

test('category JSON-LD is a CollectionPage with a Home › category breadcrumb', () => {
  const html = render(fixture({ title: 'T' }));
  const json = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
  const graph = JSON.parse(json)['@graph'];
  const [pageNode, crumbs] = graph;
  const url = `${DOMAIN}/projects/landscape/`;
  assert.equal(pageNode['@type'], 'CollectionPage');
  assert.equal(pageNode.url, url);
  assert.equal(pageNode.name, 'T');
  assert.deepEqual(pageNode.isPartOf, { '@id': `${DOMAIN}/#website` });
  assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${DOMAIN}/`], [2, 'Projects', `${DOMAIN}/projects/`], [3, 'Landscape', undefined],
  ]);
  assert.ok(html.includes('<a href="/projects/">Projects</a> <span aria-hidden="true">›</span>\n'
    + '                    <span aria-current="page">Landscape</span>'));
  assert.ok(!html.includes('aria-label="Categories"'));
  assert.equal(graph.length, 2);
  assert.ok(!json.includes('"@type":"Organization"'));
});

test('sitemap lists the hub and the 4 category pages once at priority 0.7', () => {
  const xml = sitemap([], renderPages(ROOT, '/n/', LIST), LIST);
  ['', ...CATEGORY_KEYS.map((cat) => `${cat}/`)].forEach((cat) => {
    const row = `<url><loc>${DOMAIN}/projects/${cat}</loc><priority>0.7</priority></url>`;
    assert.equal(count(xml, row), 1, cat);
  });
});

test('category partials close every div they open', () => {
  ['page-category', 'category-item'].forEach((name) => {
    const html = fs.readFileSync(path.join(ROOT, `build/lib/partials/${name}.html`), 'utf8');
    const matches = (re) => (html.match(re) || []).length;
    assert.equal(matches(/<div[\s>]/g), matches(/<\/div>/g), name);
  });
});

test('an overridden project stays in its override category only', () => {
  const res2 = ['architecture', 'landscape'];
  const entry = { name: 'Skye Residences', cat: 'master-planning', p: { res2 } };
  assert.equal(inCategory(entry, 'master-planning'), true);
  assert.equal(inCategory(entry, 'landscape'), false);
  assert.equal(inCategory(entry, 'architecture'), false);
  const other = { name: 'Zoya', cat: 'architecture', p: { res2: ['architecture', 'landscape'] } };
  assert.equal(inCategory(other, 'landscape'), true);
});

const hubFile = path.join(ROOT, 'content', 'pages', 'projects.json');
const hubContent = JSON.parse(fs.readFileSync(hubFile, 'utf8'));

test('the hub lists all projects in data/projects.json order and links the 4 categories', () => {
  assert.deepEqual(names('all'), LIST.map((e) => e.name));
  assert.equal(LIST.length, 32);
  const html = render(hubContent, 'all');
  assert.equal(count(html, '<div class="project__item">'), 32);
  const hrefs = [...html.matchAll(/class="project__link" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, LIST.map((e) => e.url));
  const nav = html.split('aria-label="Categories">')[1].split('</nav>')[0];
  assert.deepEqual([...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), [
    ['/projects/architecture/', 'Architecture'], ['/projects/interior-design/', 'Interior Design'],
    ['/projects/landscape/', 'Landscape'], ['/projects/master-planning/', 'Master Planning'],
  ]);
  assert.equal(count(nav, '·'), 3);
});

test('the hub crumb ends at Projects and its JSON-LD has Home › Projects', () => {
  const html = render(hubContent, 'all');
  assert.ok(html.includes('<a href="/">Home</a> <span aria-hidden="true">›</span>\n'
    + '                    <span aria-current="page">Projects</span>\n                </nav>'));
  assert.ok(!html.includes('<a href="/projects/">Projects</a>'));
  const json = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
  const graph = JSON.parse(json)['@graph'];
  const [pageNode, crumbs, org] = graph;
  assert.equal(pageNode.url, `${DOMAIN}/projects/`);
  assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${DOMAIN}/`], [2, 'Projects', undefined],
  ]);
  assert.equal(graph.length, 3);
  assert.deepEqual(org, ORGANIZATION);
});

test('the hub head has its own SEO tags and an absolute og:image', () => {
  const url = `${DOMAIN}/projects/`;
  const html = render(hubContent, 'all');
  assert.ok(html.includes('<title>Luxury Villa Portfolio, Dubai: All Projects | Nellis</title>'));
  assert.ok(html.includes('<meta name="description" content="Luxury villa portfolio by Nellis '
    + 'Architecture in Dubai: villas on Palm Jumeirah, Emirates Hills and Saadiyat, interiors, '
    + 'landscape and master planning." />'));
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
  assert.equal(count(html, 'property="og:image"'), 1);
  const thumb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'search.json'), 'utf8'))
    .find((s) => s.title === LIST[0].name).minImg;
  const upload = originalOf(thumb, readManifest(ROOT));
  assert.ok(html.includes(`<meta property="og:image" content="${DOMAIN}/${upload}">`));
});
