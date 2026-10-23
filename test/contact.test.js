const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contact = require('../build/lib/pages/contact');
const { SAME_AS } = require('../build/lib/seo');
const { PAGES, renderPages } = require('../build/lib/pages');
const { loadProjects } = require('../build/lib/projects');
const { sitemap } = require('../build-news');

const ROOT = path.join(__dirname, '..');
const URL = 'https://nellisarchitecture.com/contact/';
const read = (name) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'pages', `${name}.json`), 'utf8'),
);
const site = read('site');
const content = read('contact');
const page = PAGES.find((p) => p.slug === 'contact');
const render = (c = content) => contact.render(c, { site, newsHref: '/news/', page });
const count = (s, sub) => s.split(sub).length - 1;
const ldJson = (html) => JSON.parse(
  html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1],
);

test('the /contact/ page has its own title, description, canonical and Open Graph tags', () => {
  const html = render();
  assert.ok(html.includes(`<title>${content.seo.title}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${content.seo.description}" />`));
  assert.ok(html.includes(`<link rel="canonical" href="${URL}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${URL}" />`));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.ok(!html.includes('article:modified_time'));
  assert.ok(!html.includes('{{'));
});

test('the page form posts natively to the Worker; only the modal form keeps the theme id', () => {
  const html = render();
  assert.equal(count(html, 'id="yourFormId"'), 1);
  assert.equal(count(html, 'name="contact" action="/api/message" method="post"'), 2);
  const pageForm = html.slice(html.indexOf('<div class="contactForm">'));
  assert.ok(pageForm.includes('<form class="projectForm" name="contact" action="/api/message"'));
});

test('the page shows the address, a Google Maps link and the email, and loads no map frame', () => {
  const html = render();
  const query = encodeURIComponent(content.address);
  assert.ok(html.includes(`<address class="contactAddress">${content.address}</address>`));
  const maps = 'https://www.google.com/maps/search/?api=1&amp;query=';
  assert.ok(html.includes(`href="${maps}${query}" target="_blank" rel="noopener"`));
  assert.ok(html.includes(`href="mailto:${site.forms.contact.email}"`));
  assert.ok(!/<iframe/i.test(html));
});

test('mapLink encodes the address in the query', () => {
  assert.equal(
    contact.mapLink('A & B, C/D'),
    'https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%20C%2FD',
  );
});

test('the JSON-LD has the ContactPage, the breadcrumb and the LocalBusiness', () => {
  const graph = ldJson(render())['@graph'];
  const types = graph.map((n) => n['@type']);
  assert.deepEqual(types, ['ContactPage', 'BreadcrumbList', 'LocalBusiness']);
  assert.equal(graph[0]['@id'], URL);
  assert.equal(graph[0].isPartOf['@id'], 'https://nellisarchitecture.com/#website');
  const biz = graph[2];
  assert.equal(biz['@id'], 'https://nellisarchitecture.com/#localbusiness');
  assert.equal(biz.email, site.forms.contact.email);
  assert.equal(biz.image, 'https://nellisarchitecture.com/wp-content/uploads/2025/02/logo.png');
  assert.equal(biz.address.addressLocality, 'Dubai');
  assert.equal(biz.address.addressCountry, 'AE');
  assert.ok(content.address.startsWith(biz.address.streetAddress));
  assert.ok(!('telephone' in biz));
  assert.deepEqual(biz.sameAs, SAME_AS);
});

test('schema escapes < so CMS text cannot close the script tag', () => {
  const json = contact.schema(URL, '</script><b>', 'd', 'e@x');
  assert.ok(!json.includes('<'));
  assert.equal(JSON.parse(json)['@graph'][0].name, '</script><b>');
});

test('the page escapes CMS text', () => {
  const html = render({ ...content, h1: 'A <b> & C', address: 'X "<y>"' });
  assert.ok(html.includes('<h2 class="categoryTitle">A &lt;b&gt; &amp; C</h2>'));
  assert.ok(html.includes('<address class="contactAddress">X "&lt;y&gt;"</address>'));
});

test('an empty address stops the build', () => {
  assert.throws(() => render({ ...content, address: ' ' }), /no address/);
  assert.throws(() => render({ ...content, address: undefined }), /no address/);
});

test('the contact address matches the footer office address', () => {
  const file = path.join(ROOT, 'build', 'lib', 'partials', 'footer.html');
  const footer = fs.readFileSync(file, 'utf8');
  const text = footer.match(/<span class="discription"\s*>([^<]+)<\/span/)[1].trim();
  assert.equal(content.address, text);
});

test('the sitemap lists /contact/ once', () => {
  const pages = renderPages(ROOT, '/news/', loadProjects(ROOT));
  assert.ok(pages.some((p) => p.file === 'contact/index.html'));
  assert.equal(count(sitemap([], pages), `<loc>${URL}</loc>`), 1);
});
