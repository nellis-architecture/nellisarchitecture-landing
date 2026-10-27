const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const news = require('../build/lib/pages/news');
const { PAGES, renderPages } = require('../build/lib/pages');
const { loadProjects } = require('../build/lib/projects');
const { readManifest, SLOTS } = require('../build/lib/images');
const { escAttr } = require('../build/lib/html');
const {
  loadPosts, sitemap, pruneNews, refreshNewsLists,
} = require('../build-news');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://nellisarchitecture.com';
const UP = `${DOMAIN}/wp-content/uploads`;
const MINIS = '/wp-content/themes/nellis/assets/img/minis.png';
const POSTS = loadPosts(path.join(ROOT, 'content', 'news'));
const LIST = loadProjects(ROOT);
const read = (name) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'pages', `${name}.json`), 'utf8'),
);
const site = read('site');
const content = read('news');
const page = PAGES.find((p) => p.slug === 'news');
const render = (posts, manifest) => news.render(content, {
  site, newsHref: '/news/', page, posts, manifest,
});
const count = (s, sub) => s.split(sub).length - 1;
const post = (over) => ({
  slug: 's',
  title: 'T',
  date: 'May 1, 2026',
  html: '',
  dateObj: new Date(Date.UTC(2026, 4, 1)),
  ...over,
});

test('the /news/ page lists all posts newest first with title, date and link', () => {
  const html = render(POSTS);
  const hrefs = [...html.matchAll(/<h3 class="newsIndexTitle"><a href="([^"]+)">/g)]
    .map((m) => m[1]);
  assert.deepEqual(hrefs, POSTS.map((p) => `/news/${p.slug}/`));
  const dates = [...html.matchAll(/<time class="newsIndexDate" datetime="([^"]+)">/g)]
    .map((m) => m[1]);
  assert.deepEqual([...dates].sort().reverse(), dates);
  const [first] = POSTS;
  const iso = first.dateObj.toISOString().slice(0, 10);
  assert.ok(html.includes(`datetime="${iso}">${first.date}</time>`));
  assert.ok(!html.includes('{{'));
});

test('heroPath keeps local images and drops video, missing and foreign heroes', () => {
  assert.equal(news.heroPath({ hero: `${UP}/a/b.jpg` }), '/wp-content/uploads/a/b.jpg');
  assert.equal(news.heroPath({ hero: `${UP}/a/b.JPEG` }), '/wp-content/uploads/a/b.JPEG');
  assert.equal(news.heroPath({ hero: `${UP}/a/quiet.webp` }), '/wp-content/uploads/a/quiet.webp');
  assert.equal(news.heroPath({ hero: `${UP}/a/v.mp4` }), null);
  assert.equal(news.heroPath({}), null);
  assert.equal(news.heroPath({ hero: 'https://example.com/x.jpg' }), null);
});

test('each item shows the hero, else minis.png, with the hero alt or the title', () => {
  const html = render([
    post({ slug: 'a', hero: `${UP}/a.jpg`, hero_alt: 'Alt "q"' }),
    post({ slug: 'b', hero: `${UP}/b.webp` }),
    post({ slug: 'c', hero: `${UP}/c.mp4`, title: 'C & D' }),
    post({ slug: 'd' }),
  ]);
  const imgs = [...html.matchAll(/<img src="([^"]+)"(?: width="\d+" height="\d+")? alt="([^"]*)"/g)]
    .map((m) => [m[1], m[2]]);
  assert.deepEqual(imgs, [
    ['/wp-content/uploads/a.jpg', 'Alt &quot;q&quot;'],
    ['/wp-content/uploads/b.webp', 'T'],
    [MINIS, 'C &amp; D'],
    [MINIS, 'T'],
  ]);
});

test('every real post image exists on disk', () => {
  POSTS.forEach((p) => {
    const src = news.heroPath(p) || MINIS;
    assert.ok(fs.existsSync(path.join(ROOT, decodeURI(src))), src);
  });
});

test('excerpt uses the description, else the first paragraph as plain text', () => {
  assert.equal(news.excerpt(post({ description: 'Desc', html: '<p>Body</p>' })), 'Desc');
  const html = '<h2>H</h2>\n<p>One <a href="x">link</a> and\n<strong>bold</strong></p>\n<p>Two</p>';
  assert.equal(news.excerpt(post({ html })), 'One link and bold');
  assert.equal(news.excerpt(post({ html: '<h2>Only</h2>' })), '');
});

test('excerpt keeps 160 characters, cuts longer text at a word and adds …', () => {
  const exact = `${'a'.repeat(155)} bcde`;
  assert.equal(exact.length, 160);
  assert.equal(news.excerpt(post({ description: exact })), exact);
  const long = `${'word '.repeat(40)}end`;
  const cut = news.excerpt(post({ description: long }));
  assert.ok(cut.length <= 160, cut.length);
  assert.ok(cut.endsWith('word…'), cut);
  const oneWord = 'x'.repeat(200);
  assert.equal(news.excerpt(post({ description: oneWord })), `${'x'.repeat(159)}…`);
  const comma = `${'a'.repeat(158)}, b c`;
  assert.equal(news.excerpt(post({ description: comma })), `${'a'.repeat(158)}…`);
});

test('item text is escaped and $& stays literal', () => {
  const html = render([post({ title: 'A <b> & $&', description: 'D <i> & $&' })]);
  assert.ok(html.includes('<a href="/news/s/">A &lt;b&gt; &amp; $&amp;</a>'));
  assert.ok(html.includes('<p class="newsIndexExcerpt">D &lt;i&gt; &amp; $&amp;</p>'));
});

test('the /news/ page has its own title, meta, canonical and schema', () => {
  const html = render(POSTS);
  const url = `${DOMAIN}/news/`;
  const title = 'Luxury Villa Architecture News &amp; Insights, Dubai | Nellis';
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${content.seo.description}" />`));
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.ok(html.includes(`<meta property="og:image" content="${DOMAIN}${MINIS}">`));
  assert.ok(!html.includes('article:modified_time'));
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
  const json = JSON.parse(ld);
  const [pageNode, crumbs] = json['@graph'];
  assert.equal(pageNode['@type'], 'CollectionPage');
  assert.equal(pageNode.url, url);
  assert.equal(pageNode.isPartOf, undefined);
  assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${DOMAIN}/`], [2, 'News', undefined],
  ]);
  assert.ok(html.includes('<span aria-current="page">News</span>'));
  assert.equal(count(html, '<h2 class="categoryTitle">News</h2>'), 1);
});

test('the /news/ page throws without posts', () => {
  assert.throws(() => render([]), /no posts/);
  assert.throws(() => render(undefined), /no posts/);
});

test('renderPages writes news/index.html only with posts; the sitemap lists /news/ once', () => {
  assert.ok(!renderPages(ROOT, '/news/', LIST).some((p) => p.file === 'news/index.html'));
  const pages = renderPages(ROOT, '/news/', LIST, POSTS);
  assert.equal(pages.filter((p) => p.file === 'news/index.html').length, 1);
  const xml = sitemap(POSTS, pages, LIST);
  assert.equal(count(xml, `<url><loc>${DOMAIN}/news/</loc><priority>0.7</priority></url>`), 1);
});

test('news/index.html survives pruneNews and refreshNewsLists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'news-index-'));
  const dir = (d) => path.join(root, 'news', d);
  fs.mkdirSync(dir('kept'), { recursive: true });
  fs.mkdirSync(dir('stale'));
  const postPage = '<div class="NewsList">\nold\n<div class="elscroll"></div>';
  fs.writeFileSync(path.join(dir('kept'), 'index.html'), postPage);
  const indexPage = '<div class="newsIndex">list</div>';
  fs.writeFileSync(path.join(root, 'news', 'index.html'), indexPage);
  pruneNews(root, [{ slug: 'kept' }]);
  refreshNewsLists(root, 'NEW');
  assert.ok(!fs.existsSync(dir('stale')));
  assert.equal(fs.readFileSync(path.join(root, 'news', 'index.html'), 'utf8'), indexPage);
  assert.match(fs.readFileSync(path.join(dir('kept'), 'index.html'), 'utf8'), /NEW/);
  fs.rmSync(root, { recursive: true });
});

test('news partials close every div they open', () => {
  ['page-news', 'news-item'].forEach((name) => {
    const html = fs.readFileSync(path.join(ROOT, `build/lib/partials/${name}.html`), 'utf8');
    const matches = (re) => (html.match(re) || []).length;
    assert.equal(matches(/<div[\s>]/g), matches(/<\/div>/g), name);
  });
});

test('the /news/ page keeps a noindex post', () => {
  assert.ok(render([post({ slug: 'hidden', noindex: true })]).includes('href="/news/hidden/"'));
});

test('the first /news/ card is the priority image, the other cards are lazy', () => {
  const manifest = readManifest(ROOT);
  const html = render([
    post({ slug: 'a', hero: `${UP}/2026/07/Luxury-home-design-Dubai-scaled.jpg` }),
    post({ slug: 'b', hero: `${UP}/2026/07/Zoya6-1024x576.jpg` }),
    post({ slug: 'c' }),
  ], manifest);
  const cards = html.split('<article class="newsIndexItem">').slice(1);
  assert.equal(cards.length, 3);
  assert.match(cards[0], /<picture [^]*loading="eager" fetchpriority="high"/);
  cards.slice(1).forEach((c) => {
    assert.match(c, /loading="lazy"/);
    assert.ok(!c.includes('fetchpriority'));
  });
  assert.ok(cards[1].includes(`sizes="${escAttr(SLOTS.teaser)}"`));
  assert.match(cards[1], /src="\/wp-content\/variants\/2026\/07\/Zoya6-1024x576-/);
  assert.ok(!html.includes(`src="${UP}`));
  assert.equal(count(render(POSTS, manifest), 'fetchpriority="high"'), 1);
});
