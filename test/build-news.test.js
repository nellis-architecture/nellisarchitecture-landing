const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseFrontMatter, inlineMd, mdToHtml, parseDate, monthIndex, esc, idNum, sitemap, loadPosts,
  renderPost, fillSite, readingTime, newsImg, newsJsonEntry, newsList, articleSchema,
} = require('../build-news');
const { readManifest, SLOTS } = require('../build/lib/images');
const { escAttr } = require('../build/lib/html');
const { rss } = require('../build/lib/feed');
const { INDEX, LOGO, NOINDEX } = require('../build/lib/seo');
const contact = require('../build/lib/pages/contact');

test('parseFrontMatter reads plain and quoted values', () => {
  const src = '---\ntitle: "A \\"quoted\\" title"\nslug: my-post\n---\n\nBody text\n';
  const { fm, body } = parseFrontMatter(src);
  assert.equal(fm.title, 'A "quoted" title');
  assert.equal(fm.slug, 'my-post');
  assert.equal(body, 'Body text');
});

test('parseFrontMatter ignores lines that are not keys', () => {
  const { fm } = parseFrontMatter('---\ntitle: T\n- stray\nBad-Key: x\n---\n');
  assert.deepEqual(fm, { title: 'T' });
});

test('parseFrontMatter joins a value that a CMS save folded onto indented lines', () => {
  const src = [
    '---',
    'title: Can Architecture Make a Luxury Brand More Desirable? The Psychology of',
    '  Premium Retail Design',
    'description: "Luxury retail design: why a store must do more than display a product -',
    '  it must tell a story,',
    '  and sell it"',
    'date: Aug 11, 2026',
    'id: "1077"',
    '---',
    'Body',
  ].join('\n');
  const { fm, body } = parseFrontMatter(src);
  assert.equal(fm.title, 'Can Architecture Make a Luxury Brand More Desirable? '
    + 'The Psychology of Premium Retail Design');
  assert.equal(fm.description, 'Luxury retail design: why a store must do more than display '
    + 'a product - it must tell a story, and sell it');
  assert.equal(fm.date, 'Aug 11, 2026');
  assert.equal(fm.id, '1077');
  assert.equal(body, 'Body');
});

test('parseFrontMatter throws on a missing front matter block', () => {
  assert.throws(() => parseFrontMatter('no front matter', 'x.md'), /bad front matter: x\.md/);
});

const FALLBACK = (src, alt) => `<picture><img src="${src}" alt="${alt}" decoding="async" `
  + 'loading="lazy" data-overlay-added="true"></picture>';

test('inlineMd renders images before links, bold before italics', () => {
  assert.equal(inlineMd('![alt](/a.jpg)'), FALLBACK('/a.jpg', 'alt'));
  assert.equal(inlineMd('[site](https://x.com)'), '<a href="https://x.com">site</a>');
  assert.equal(inlineMd('**b** and *i*'), '<strong>b</strong> and <em>i</em>');
});

test('inlineMd keeps emphasis markup out of the image alt', () => {
  assert.equal(inlineMd('![a *b* c](/a.jpg)'), FALLBACK('/a.jpg', 'a *b* c'));
  assert.equal(inlineMd('![a **b** c](/a.jpg)'), FALLBACK('/a.jpg', 'a **b** c'));
});

test('inlineMd does not let a link break out of the image alt', () => {
  const html = inlineMd('![x [y](z)](q" onerror="alert(1))');
  assert.equal(html, `${FALLBACK('z', 'x [y')}](q" onerror="alert(1))`);
  assert.equal(html.match(/<img\b/g).length, 1);
  assert.doesNotMatch(html, /<[^>]*\sonerror=/);
  assert.doesNotMatch(html, /<a\b/);
});

test('inlineMd escapes link hrefs and keeps emphasis out of them', () => {
  assert.equal(inlineMd('[t](/a?x=1&y="2")'), '<a href="/a?x=1&amp;y=&quot;2&quot;">t</a>');
  assert.equal(inlineMd('[t](/a*b*c)'), '<a href="/a*b*c">t</a>');
});

test('inlineMd renders a line with image, link, bold and italic as before', () => {
  assert.equal(
    inlineMd('![alt](/a.jpg) see [**site**](https://x.com/p) and *i*'),
    `${FALLBACK('/a.jpg', 'alt')} see <a href="https://x.com/p"><strong>site</strong></a>`
      + ' and <em>i</em>',
  );
});

test('inlineMd keeps safe link schemes and drops the link of other schemes', () => {
  ['https://x.com', 'http://x.com', 'mailto:a@b.c', 'tel:+123', '/p/', '#top', 'p/q']
    .forEach((h) => assert.equal(inlineMd(`[t](${h})`), `<a href="${h}">t</a>`));
  const js = ['java', 'script:'].join('');
  [`${js}void0`, `${js.toUpperCase()}x`, 'java\tscript:x', ' data:text/html,x', 'vbscript:x']
    .forEach((h) => assert.equal(inlineMd(`[t](${h})`), 't'));
});

test('mdToHtml renders each block type', () => {
  const md = [
    '## Heading', '#### Small', '---', '- one\n- two', '> quote',
    '![a](/i.jpg)', 'line one\nline two',
  ].join('\n\n');
  assert.equal(mdToHtml(md), [
    '<h2>Heading</h2>',
    '<h4>Small</h4>',
    '<hr />',
    '<ul><li>one</li><li>two</li></ul>',
    '<blockquote>quote</blockquote>',
    FALLBACK('/i.jpg', 'a'),
    '<p>line one line two</p>',
  ].join('\n'));
});

test('mdToHtml skips empty blocks and treats # (h1) as a paragraph', () => {
  assert.equal(mdToHtml('\n\n\n\n# Title\n\n\n'), '<p># Title</p>');
  assert.equal(mdToHtml(''), '');
});

test('parseDate reads the CMS date format as UTC', () => {
  assert.equal(parseDate('August 14, 2026').toISOString(), '2026-08-14T00:00:00.000Z');
  assert.equal(parseDate('march 5,2025').toISOString(), '2025-03-05T00:00:00.000Z');
});

test('parseDate falls back to epoch for missing or bad dates, January for unknown months', () => {
  assert.equal(parseDate(undefined).getTime(), 0);
  assert.equal(parseDate('2026-08-14').getTime(), 0);
  assert.equal(parseDate('Foo 2, 2026').toISOString(), '2026-01-02T00:00:00.000Z');
});

test('esc escapes HTML attribute characters and tolerates empty input', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(undefined), '');
});

test('idNum returns the numeric id or 0', () => {
  assert.equal(idNum({ id: '42' }), 42);
  assert.equal(idNum({ id: 'mdslug' }), 0);
});

const PAGE_LIST = [
  { slug: '', priority: '1.0', noindex: false },
  { slug: 'studio', priority: '0.8', noindex: false },
  { slug: 'privacy', priority: '0.2', noindex: true },
];

test('sitemap lists the pages and posts with lastmod', () => {
  const xml = sitemap([{ slug: 'p', dateObj: new Date(Date.UTC(2026, 0, 2)) }], PAGE_LIST);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
  const site = 'https://nellisarchitecture.com';
  assert.ok(xml.includes(`\n  <url><loc>${site}/</loc><priority>1.0</priority></url>\n`));
  assert.ok(xml.includes(`<url><loc>${site}/studio/</loc><priority>0.8</priority></url>`));
  assert.ok(xml.includes(`<loc>${site}/news/p/</loc><lastmod>2026-01-02</lastmod>`));
  assert.ok(!xml.includes('index.html'));
  assert.ok(!xml.includes('.com//'));
  assert.ok(xml.endsWith('</urlset>\n'));
});

test('sitemap skips noindex pages', () => {
  const xml = sitemap([], PAGE_LIST);
  assert.ok(!xml.includes('/privacy/'));
  assert.equal(xml.split('<url>').length - 1, 2);
});

test('loadPosts refuses a slug that is not lowercase letters, digits and dashes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posts-'));
  const post = (slug) => '---\ntitle: T\n'
    + `slug: ${slug}\ncategory: interior-design\ndate: 2026-01-02\n---\nBody\n`;
  fs.writeFileSync(path.join(dir, 'ok.md'), post('ok-post-2'));
  assert.equal(loadPosts(dir)[0].slug, 'ok-post-2');
  ['..', '../x', 'a/b', 'Upper', 'two words', 'a--b', '-a', ''].forEach((bad) => {
    fs.writeFileSync(path.join(dir, 'bad.md'), post(bad));
    assert.throws(() => loadPosts(dir), /slug must be lowercase/, bad);
  });
  fs.rmSync(dir, { recursive: true });
});

test('news template has no feed link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'build', 'news-template.html'), 'utf8');
  assert.doesNotMatch(html, /href=["'][^"']*feed\//);
});

const ROOT = path.join(__dirname, '..');
const RAW_TEMPLATE = fs.readFileSync(path.join(ROOT, 'build', 'news-template.html'), 'utf8');
const SITE_JSON = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'pages', 'site.json'), 'utf8'),
);
const TEMPLATE = fillSite(RAW_TEMPLATE, SITE_JSON);
const meta = (html, prop) => [
  ...html.matchAll(new RegExp(`(?:property|name)="${prop}" content="([^"]*)"`, 'g')),
].map((m) => m[1]);
const SITE = 'https://nellisarchitecture.com';
const UP = `${SITE}/wp-content/uploads`;
const post = (over) => ({
  slug: 's',
  title: 'T',
  category: 'interior-design',
  html: '<p>x</p>',
  dateObj: new Date(Date.UTC(2025, 11, 22)),
  ...over,
});

test('news template links the nav News item and the News crumb to /news/', () => {
  const html = renderPost(TEMPLATE, post({ title: 'P' }), '');
  assert.ok(html.includes('<a href="/news/">News</a>\n              </li>'));
  assert.ok(TEMPLATE.includes('<a href="/">Home</a> <span>/</span> <a href="/news/">News</a>'));
  assert.doesNotMatch(TEMPLATE, /href="index\.html"/);
});

test("renderPost keeps $& and $' literal in a nav label and a follow label", () => {
  const site = {
    nav: [{ label: "A $& B $' C", link: '/news/' }],
    follow: [{ label: "F $& $'", link: 'https://e.com/' }],
  };
  const html = renderPost(TEMPLATE, post({ title: 'P' }), '', {}, site);
  const wantNav = '<a href="/news/">A $&amp; B $\' C</a>';
  const wantFollow = '<a target="_blank" href="https://e.com/">F $&amp; $\'</a>';
  assert.ok(html.includes(wantNav), wantNav);
  assert.ok(html.includes(wantFollow), wantFollow);
});

test('renderPost gives each post its own og:image, size and published time', () => {
  const a = renderPost(TEMPLATE, post({
    hero: `${UP}/2025/12/25-questions.jpg`,
  }), '');
  const b = renderPost(TEMPLATE, post({
    hero: `${UP}/2025/09/Bespoke-Design-for-Dubai-Homes.png`,
    dateObj: new Date(Date.UTC(2025, 8, 3)),
  }), '');
  assert.deepEqual(meta(a, 'og:image'), [`${UP}/2025/12/25-questions.jpg`]);
  assert.deepEqual(meta(a, 'og:image:width'), ['1187']);
  assert.deepEqual(meta(a, 'og:image:height'), ['791']);
  assert.deepEqual(meta(a, 'og:image:type'), ['image/jpeg']);
  assert.deepEqual(meta(a, 'article:published_time'), ['2025-12-22T00:00:00.000Z']);
  assert.deepEqual(meta(a, 'article:modified_time'), ['2025-12-22T00:00:00.000Z']);
  assert.deepEqual(meta(b, 'og:image:width'), ['620']);
  assert.deepEqual(meta(b, 'og:image:height'), ['404']);
  assert.deepEqual(meta(b, 'og:image:type'), ['image/png']);
  assert.deepEqual(meta(b, 'article:published_time'), ['2025-09-03T00:00:00.000Z']);
  assert.doesNotMatch(a + b, /GAFSTAoL|2025-11-24T17:25:07/);
});

test('renderPost falls back to minis.png without a hero or with an unreadable one', () => {
  const minis = `${SITE}/wp-content/themes/nellis/assets/img/minis.png`;
  [undefined, `${UP}/missing.jpg`, `${UP}/2025/07/One-Year-Anniversary-Video-For-Website.mp4`,
    'https://example.com/x.jpg'].forEach((hero) => {
    const html = renderPost(TEMPLATE, post({ hero }), '');
    assert.deepEqual(meta(html, 'og:image'), [minis], hero);
    assert.deepEqual(meta(html, 'og:image:width'), ['968']);
    assert.deepEqual(meta(html, 'og:image:height'), ['504']);
    assert.deepEqual(meta(html, 'og:image:type'), ['image/png']);
  });
});

test('every real post renders exactly one og:image that exists on disk', () => {
  loadPosts(path.join(ROOT, 'content', 'news')).forEach((p) => {
    const html = renderPost(TEMPLATE, p, '');
    const urls = meta(html, 'og:image');
    assert.equal(urls.length, 1, p.slug);
    ['og:image:width', 'og:image:height', 'og:image:type']
      .forEach((k) => assert.equal(meta(html, k).length, 1, k));
    assert.ok(fs.existsSync(path.join(ROOT, urls[0].slice(SITE.length))), urls[0]);
  });
});

test('renderPost breadcrumb schema links News to /news/', () => {
  const html = renderPost(TEMPLATE, post({ title: 'P' }), '');
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
  const json = JSON.parse(ld);
  const crumbs = json['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
  assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${SITE}/`], [2, 'News', `${SITE}/news/`], [3, 'P', undefined],
  ]);
});

test('renderPost adds the site name to <title> once', () => {
  const title = (over) => renderPost(TEMPLATE, post(over), '').match(/<title>([^<]*)<\/title>/)[1];
  const name = ' | Nellis Architecture';
  assert.equal(title({ title: 'A' }), `A${name}`);
  assert.equal(title({ title: `A | Dubai${name}` }), `A | Dubai${name}`);
  assert.equal(title({ title: 'Nellis Architecture news' }), `Nellis Architecture news${name}`);
  assert.equal(title({ title: 'A', seo_title: 'S' }), 'S');
});

test('articleSchema emits the image and the publisher logo and no dateModified', () => {
  const ld = articleSchema(post({}), `${UP}/2025/12/25-questions.jpg`);
  const article = JSON.parse(ld)['@graph'][0];
  assert.deepEqual(Object.keys(article), [
    '@type', 'headline', 'description', 'image',
    'datePublished', 'mainEntityOfPage', 'author', 'publisher',
  ]);
  assert.equal(article.datePublished, '2025-12-22T00:00:00.000Z');
  assert.deepEqual(article.author, { '@type': 'Organization', name: 'Nellis Architecture' });
  assert.equal(article.image, `${UP}/2025/12/25-questions.jpg`);
  assert.equal(article.publisher.logo, LOGO);
  assert.doesNotMatch(ld, /dateModified/);
});

test('the schema image follows the hero: a local image, an unreadable one and none', () => {
  const minis = `${SITE}/wp-content/themes/nellis/assets/img/minis.png`;
  const hero = `${UP}/2025/12/25-questions.jpg`;
  [[hero, hero], [`${UP}/missing.jpg`, minis], [undefined, minis]].forEach(([h, want]) => {
    const html = renderPost(TEMPLATE, post({ hero: h }), '');
    const ld = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
    assert.equal(JSON.parse(ld)['@graph'][0].image, want, h);
  });
});

test('every real post puts its og:image in the schema and no dateModified', () => {
  loadPosts(path.join(ROOT, 'content', 'news')).forEach((p) => {
    const html = renderPost(TEMPLATE, p, '');
    const ld = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
    const article = JSON.parse(ld)['@graph'][0];
    assert.equal(article.image, meta(html, 'og:image')[0], p.slug);
    assert.equal(article.publisher.logo, LOGO, p.slug);
    assert.doesNotMatch(ld, /dateModified/, p.slug);
  });
});

test('the news publisher logo and the /contact/ LocalBusiness logo are one URL', () => {
  const biz = JSON.parse(contact.schema(`${SITE}/contact/`, 'n', 'd', 'e@x', []))['@graph']
    .find((n) => n['@type'] === 'LocalBusiness');
  const article = JSON.parse(articleSchema(post({}), 'x'))['@graph'][0];
  assert.equal(article.publisher.logo, biz.logo);
});

test('readingTime counts plain-text words at 200 per minute, at least 1 minute', () => {
  assert.equal(readingTime(''), '1 minute');
  assert.equal(readingTime('<p>one <a href="https://x.com/a b c">two</a></p>'), '1 minute');
  assert.equal(readingTime(`<p>${'w '.repeat(200)}</p>`), '1 minute');
  assert.equal(readingTime(`<p>${'w '.repeat(201)}</p>`), '2 minutes');
});

test('renderPost writes the reading time and keeps the author', () => {
  const html = renderPost(TEMPLATE, post({ html: `<p>${'w '.repeat(450)}</p>` }), '');
  assert.deepEqual(meta(html, 'twitter:data2'), ['3 minutes']);
  assert.deepEqual(meta(html, 'twitter:data1'), ['Santaclaus']);
  assert.deepEqual(meta(html, 'author'), ['Santaclaus']);
});

test('loadPosts reads noindex as a boolean and refuses other values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posts-'));
  const file = path.join(dir, 'p.md');
  const write = (line) => fs.writeFileSync(
    file,
    `---\ntitle: T\nslug: p\ncategory: interior-design\n${line}\n---\nBody\n`,
  );
  [['noindex: true', true], ['noindex: "true"', true], ['noindex: false', false],
    ['noindex: "false"', false], ['', false], ['noindex:', false]].forEach(([line, want]) => {
    write(line);
    assert.equal(loadPosts(dir)[0].noindex, want, line);
  });
  ['yes', '1', 'True'].forEach((bad) => {
    write(`noindex: ${bad}`);
    const named = (e) => e.message.includes(file) && /noindex/.test(e.message);
    assert.throws(() => loadPosts(dir), named, bad);
  });
  fs.rmSync(dir, { recursive: true });
});

test('renderPost writes noindex robots for a noindex post, index robots by default', () => {
  const hidden = renderPost(TEMPLATE, post({ noindex: true }), '');
  assert.equal(hidden.split(NOINDEX).length - 1, 1);
  assert.ok(!hidden.includes(INDEX));
  assert.ok(!hidden.includes('{{ROBOTS}}'));
  const shown = renderPost(TEMPLATE, post(), '');
  assert.equal(shown.split(INDEX).length - 1, 1);
  assert.ok(!shown.includes(NOINDEX));
});

test('sitemap skips noindex posts and keeps the others', () => {
  const dateObj = new Date(Date.UTC(2026, 0, 2));
  const xml = sitemap([{ slug: 'a', dateObj, noindex: true }, { slug: 'b', dateObj }], []);
  assert.ok(!xml.includes('/news/a/'));
  assert.ok(xml.includes('/news/b/'));
});

const VIDEO_IMG = (src) => '<div class="NewsImg">\n            '
  + '<video autoplay muted loop playsinline>'
  + `<source src="${src}" type="video/mp4" /></video>\n          </div>`;

test('renderPost shows an mp4 hero as a video, not as an img', () => {
  const src = `${UP}/2025/07/no-poster.mp4`;
  const html = renderPost(TEMPLATE, post({ hero: src }), '');
  assert.ok(html.includes(VIDEO_IMG(src)));
  assert.doesNotMatch(html, /<img src="[^"]*\.mp4"/);
});

test('the real anniversary post renders a video and keeps the minis.png og:image', () => {
  const p = loadPosts(path.join(ROOT, 'content', 'news'))
    .find((x) => x.slug.startsWith('one-year-anniversary'));
  const html = renderPost(TEMPLATE, p, '');
  assert.match(html, /<div class="NewsImg">\n {12}<video /);
  assert.doesNotMatch(html, /<img src="[^"]*\.mp4"/);
  const minis = `${SITE}/wp-content/themes/nellis/assets/img/minis.png`;
  assert.deepEqual(meta(html, 'og:image'), [minis]);
});

test('newsImg renders a video, an image or a hidden div', () => {
  assert.equal(newsImg({ hero: '/v.MP4' }), VIDEO_IMG('/v.MP4'));
  assert.equal(newsImg({ hero: '/a"b&c.mp4' }), VIDEO_IMG('/a&quot;b&amp;c.mp4'));
  const img = newsImg({ hero: '/a.jpg', hero_alt: 'Alt', title: 'T' });
  assert.equal(img, '<div class="NewsImg">\n            <picture><img src="/a.jpg" alt="Alt" '
    + 'decoding="async" loading="eager" fetchpriority="high" data-overlay-added="true">'
    + '</picture>\n          </div>');
  assert.doesNotMatch(img, /<video/);
  assert.equal(newsImg({}), '<div class="NewsImg" style="display: none;">\n          </div>');
});

const MANIFEST = readManifest(ROOT);
const POSTS = loadPosts(path.join(ROOT, 'content', 'news'), MANIFEST);
const HERO = `${UP}/2026/07/Luxury-home-design-Dubai-scaled.jpg`;
const BODY = `${UP}/2026/07/Zoya6-1024x576.jpg`;
const VARIANT = /\/wp-content\/variants\//;
const imageHero = (p) => Boolean(p.hero) && !/\.mp4$/i.test(p.hero);

test('inlineMd and mdToHtml: an upload image becomes a lazy picture with local variants', () => {
  const html = inlineMd(`![A "b"](${BODY})`, MANIFEST);
  assert.match(html, /^<picture style="max-width:1024px;background-image:url\(data:image\/webp;/);
  assert.match(html, /<img src="\/wp-content\/variants\/2026\/07\/Zoya6-1024x576-\w{8}-1024\.jpg"/);
  assert.ok(html.includes(`sizes="${escAttr(SLOTS.post)}"`));
  assert.ok(html.includes('alt="A &quot;b&quot;"'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('fetchpriority'));
  assert.ok(!html.includes(SITE));
  assert.equal(mdToHtml(`![a](${BODY})`, MANIFEST), html.replace('A &quot;b&quot;', 'a'));
  assert.match(mdToHtml(`text ![a](${BODY})`, MANIFEST), /^<p>text <picture /);
});

test('inlineMd: an upload without a manifest entry is the img of the original in a picture', () => {
  const html = inlineMd(`![a](${UP}/2026/07/none.jpg)`, MANIFEST);
  assert.equal(html, FALLBACK('/wp-content/uploads/2026/07/none.jpg', 'a'));
});

test('newsImg: an image hero is the priority picture, a video stays a video', () => {
  const img = newsImg({ hero: HERO, title: 'T' }, MANIFEST);
  assert.match(img, /^<div class="NewsImg">\n {12}<picture /);
  assert.ok(img.includes('loading="eager" fetchpriority="high"'));
  assert.ok(img.includes(`sizes="${escAttr(SLOTS.post)}"`));
  assert.ok(img.includes('alt="T"'));
  assert.ok(!img.includes(SITE));
  assert.equal(newsImg({ hero: `${UP}/v.mp4` }, MANIFEST), VIDEO_IMG(`${UP}/v.mp4`));
  assert.equal(newsImg({}, MANIFEST), newsImg({}));
});

test('each real post: a priority hero image, a poster preload or none; CSS in the head', () => {
  POSTS.forEach((p) => {
    const html = renderPost(TEMPLATE, p, '', MANIFEST);
    const want = imageHero(p) ? 1 : 0;
    const poster = p.hero && !imageHero(p) ? 1 : 0;
    assert.equal(html.split('fetchpriority="high"').length - 1, want + poster, p.slug);
    assert.equal(html.split('rel="preload"').length - 1, poster, p.slug);
    assert.equal(html.split('loading="eager"').length - 1, want, p.slug);
    if (want) {
      const hero = html.split('<div class="NewsImg">')[1].split('</div>')[0];
      assert.match(hero, /fetchpriority="high"/, p.slug);
    }
    assert.equal(html.split('<style id="nellis-images-css">').length - 1, 1, p.slug);
    assert.ok(!html.includes('{{'), p.slug);
  });
});

test('og:image, the schema, the feed and the sitemap keep the original URLs', () => {
  const p = POSTS.find((x) => x.hero === HERO);
  const html = renderPost(TEMPLATE, p, '', MANIFEST);
  assert.deepEqual(meta(html, 'og:image'), [HERO]);
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
  assert.doesNotMatch(ld, VARIANT);
  assert.match(html.split('<div class="NewsImg">')[1], VARIANT);
  assert.doesNotMatch(rss(POSTS), VARIANT);
  assert.doesNotMatch(sitemap(POSTS, []), VARIANT);
  const md = fs.readFileSync(path.join(ROOT, 'content/news', `${p.filename}.md`), 'utf8');
  assert.doesNotMatch(md, VARIANT);
});

test('newsJsonEntry: picture is the hero markup for an image hero, else empty', () => {
  const p = { ...post({ hero: HERO }), slug: 's' };
  const { data } = newsJsonEntry(p, MANIFEST);
  assert.equal(data.img, HERO);
  assert.ok(newsImg(p, MANIFEST).includes(data.picture));
  assert.match(data.picture, /^<picture /);
  assert.equal(newsJsonEntry(post({ hero: `${UP}/v.mp4` }), MANIFEST).data.picture, '');
  assert.equal(newsJsonEntry(post({}), MANIFEST).data.picture, '');
});

test('loadPosts refuses a missing or unknown category and names the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posts-'));
  const file = path.join(dir, 'p.md');
  const write = (line) => fs.writeFileSync(file, `---\ntitle: T\nslug: p\n${line}\n---\nBody\n`);
  write('category: "studio-news-culture"');
  assert.equal(loadPosts(dir)[0].category, 'studio-news-culture');
  ['', 'category:', 'category: news', 'category: Interior Design', 'category: constructor']
    .forEach((line) => {
      write(line);
      const named = (e) => e.message.includes(file) && /category must be one of/.test(e.message);
      assert.throws(() => loadPosts(dir), named, line);
    });
  fs.rmSync(dir, { recursive: true });
});

test('renderPost links the post to its category page, outside .NewsData', () => {
  const html = renderPost(TEMPLATE, post({ category: 'landscape-outdoor-living', date: 'D' }), '');
  assert.ok(html.includes('<div class="NewsData">D</div>\n\n        <a class="NewsCategory" '
    + 'href="/news/category/landscape-outdoor-living/">Landscape &amp; Outdoor Living</a>'));
});

test('newsJsonEntry carries the category name and link', () => {
  const { data } = newsJsonEntry(post({ category: 'dubai-lifestyle-trends' }), MANIFEST);
  assert.equal(data.category, 'Dubai Lifestyle & Trends');
  assert.equal(data.category_href, '/news/category/dubai-lifestyle-trends/');
});

test('the switcher sets the category link text and href', () => {
  const js = TEMPLATE.slice(TEMPLATE.indexOf('function ajaxNews'));
  assert.ok(js.includes("document.querySelector('.NewsCategory').textContent = post.category;"));
  assert.ok(js.includes(
    "document.querySelector('.NewsCategory').setAttribute('href', post.category_href);",
  ));
});

test('the switcher uses post.picture first and keeps the img and video paths', () => {
  const js = TEMPLATE.slice(TEMPLATE.indexOf('function ajaxNews'));
  const at = (s) => js.indexOf(s);
  assert.ok(at('if (post.picture) {') > -1);
  assert.ok(at('mediaContainer.innerHTML = post.picture;') > at('if (post.picture) {'));
  assert.ok(at("} else if (post.img && isImageOrVideo(post.img) === 'image') {")
    > at('mediaContainer.innerHTML = post.picture;'));
  assert.ok(at("isImageOrVideo(post.img) === 'video'") > -1);
});

test('the build is current and idempotent: news pages and news.json match a new render', () => {
  const list = newsList(POSTS);
  const json = {};
  POSTS.forEach((p) => {
    json[p.id] = newsJsonEntry(p, MANIFEST);
    const file = path.join(ROOT, 'news', p.slug, 'index.html');
    assert.equal(fs.readFileSync(file, 'utf8'), renderPost(TEMPLATE, p, list, MANIFEST), p.slug);
  });
  const disk = fs.readFileSync(path.join(ROOT, 'data', 'news.json'), 'utf8');
  assert.equal(disk, JSON.stringify(json, null, 2));
  Object.values(JSON.parse(disk)).forEach(({ data }) => {
    if (/\.mp4$/i.test(data.img) || !data.img) assert.equal(data.picture, '', data.slug);
    else assert.match(data.picture, /^<picture /, data.slug);
  });
});

test('inlineMd: image in link text, forged tokens dropped, entity schemes escaped', () => {
  const linked = inlineMd('[![a](b)](c)');
  assert.ok(linked.startsWith('<a href="c">') && linked.endsWith('</a>'), linked);
  assert.ok(!linked.includes('\u0000'), linked);
  assert.equal(inlineMd('x \u00000\u0000 y'), 'x 0 y');
  assert.equal(inlineMd('[t](javascript&colon;x)'), '<a href="javascript&amp;colon;x">t</a>');
});

test('parseDate reads 3-letter month names and Sept in any case', () => {
  const iso = (s) => parseDate(s).toISOString();
  assert.equal(iso('Aug 11, 2026'), '2026-08-11T00:00:00.000Z');
  assert.equal(iso('aug 14, 2026'), '2026-08-14T00:00:00.000Z');
  assert.equal(iso('JAN 2, 2026'), '2026-01-02T00:00:00.000Z');
  assert.equal(iso('Sep 10, 2026'), '2026-09-10T00:00:00.000Z');
  assert.equal(iso('Sept 10, 2026'), '2026-09-10T00:00:00.000Z');
  assert.equal(iso('Dec 31, 2025'), '2025-12-31T00:00:00.000Z');
  assert.equal(iso('May 6, 2026'), '2026-05-06T00:00:00.000Z');
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  months.forEach((m, i) => {
    [m, m.toUpperCase(), m[0].toUpperCase() + m.slice(1)].forEach((name) => {
      assert.equal(parseDate(`${name} 2, 2026`).getUTCMonth(), i, name);
    });
  });
  ['Augu', 'Septe', 'Ju'].forEach((name) => {
    assert.equal(parseDate(`${name} 2, 2026`).toISOString(), '2026-01-02T00:00:00.000Z', name);
  });
});

test('every real post date names a known month', () => {
  loadPosts(path.join(ROOT, 'content', 'news')).forEach((p) => {
    const m = (p.date || '').match(/([A-Za-z]+)\s+\d{1,2},\s*\d{4}/);
    assert.ok(m, p.slug);
    assert.ok(monthIndex(m[1]) > -1, p.slug);
  });
});

test('the two short-month posts get August dates and sort in date order', () => {
  const posts = loadPosts(path.join(ROOT, 'content', 'news'));
  const at = (slug) => posts.findIndex((p) => p.slug === slug);
  const retail = 'luxury-commercial-architecture-the-psychology-of-premium-retail-design';
  const dubai = 'why-international-clients-continue-to-choose-dubai-'
    + 'for-bespoke-residential-architecture';
  assert.equal(posts[at(retail)].dateObj.toISOString(), '2026-08-11T00:00:00.000Z');
  assert.equal(posts[at(dubai)].dateObj.toISOString(), '2026-08-14T00:00:00.000Z');
  const order = [
    'how-dubais-climate-shapes-every-decision-a-luxury-architect-makes', dubai, retail,
    'designing-oceanfront-homes-that-feel-private',
  ].map(at);
  assert.ok(order.every((i) => i > -1), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('fillSite puts the site.json emails in every mailto link and the build year', () => {
  const site = {
    forms: {
      contact: { ...SITE_JSON.forms.contact, email: 'a@x.test' },
      skills: { ...SITE_JSON.forms.skills, email: 'b@x.test' },
    },
  };
  const html = renderPost(fillSite(RAW_TEMPLATE, site), post(), '');
  ['a@x.test', 'b@x.test'].forEach((email) => {
    assert.equal(html.split(`mailto:${email}"`).length - 1, 3, email);
    assert.equal(html.match(new RegExp(`>\\s*${email}</a`, 'g')).length, 3, email);
  });
  assert.doesNotMatch(html, /mailto:(hello|people)@/);
  assert.ok(html.includes(`© Nellis Architecture ${new Date().getUTCFullYear()}`));
  assert.ok(!html.includes('{{'));
});

const SCHEMA_FM = (value) => `---\ntitle: "T"\nschema: ${value}\nslug: s\n---\nbody`;

test('parseFrontMatter reads a `|-` block scalar with a blank line and a key after it', () => {
  const { fm, body } = parseFrontMatter(SCHEMA_FM('|-\n  {\n    "a": "b c",\n\n    "d": 1\n  }'));
  assert.equal(fm.schema, '{\n  "a": "b c",\n\n  "d": 1\n}');
  assert.equal(fm.title, 'T');
  assert.equal(fm.slug, 's');
  assert.equal(body, 'body');
  assert.equal(parseFrontMatter(SCHEMA_FM('|+\n  {}\n\n')).fm.schema, '{}');
});

test('parseFrontMatter reads a folded `>-` block scalar as the same JSON as `|-`', () => {
  const long = 'A long description line that is longer than eighty characters, so yaml folds';
  const literal = parseFrontMatter(SCHEMA_FM(
    `|-\n  {\n    "@type": "Thing",\n\n    "description": "${long} it here"\n  }`,
  )).fm.schema;
  /* As yaml@1.10.2 (Decap) writes it: a fold at a space, a blank line, more-indented lines. */
  const folded = parseFrontMatter(SCHEMA_FM(
    `>-\n  {"@type": "Thing", "description": "${long}\n  it here"\n\n  }`,
  )).fm;
  const indented = parseFrontMatter(SCHEMA_FM(
    `>-\n  {\n    "@type": "Thing",\n\n    "description": "${long} it here"\n  }`,
  )).fm.schema;
  assert.deepEqual(JSON.parse(folded.schema), JSON.parse(literal));
  assert.deepEqual(JSON.parse(indented), JSON.parse(literal));
  assert.equal(JSON.parse(folded.schema).description, `${long} it here`);
  assert.equal(folded.slug, 's');
});

test('parseFrontMatter keeps a quoted "|" value as text', () => {
  const { fm } = parseFrontMatter('---\ntitle: "|"\nslug: s\n---\n');
  assert.equal(fm.title, '|');
  assert.equal(fm.slug, 's');
});

test('renderPost adds the custom schema right after the generated block', () => {
  const yoast = /<script type="application\/ld\+json" class="yoast-schema-graph">.*<\/script>\n/;
  const plain = renderPost(TEMPLATE, post({ filename: 'f' }), '');
  assert.ok(!plain.includes('{{SCHEMA_EXTRA}}'));
  assert.equal(plain.match(/application\/ld\+json/g).length, 1);
  const html = renderPost(TEMPLATE, post({ filename: 'f', schema: '{"a":"$& $\' x"}' }), '');
  const block = '\t<script type="application/ld+json">{"a":"$& $\' x"}</script>\n';
  assert.ok(html.includes(`${html.match(yoast)[0]}${block}\t<!-- / Yoast SEO plugin. -->`));
  assert.equal(html.replace(block, ''), plain);
  assert.throws(
    () => renderPost(TEMPLATE, post({ filename: 'f', schema: '"s"' }), ''),
    /content\/news\/f\.md: schema must be a JSON object or array/,
  );
});
