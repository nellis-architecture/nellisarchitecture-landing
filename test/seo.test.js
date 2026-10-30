const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  LOGO, customSchema, organization, pageUrl, sameAs, seoTokens, withOrganization, yoastPage,
} = require('../build/lib/seo');
const { PAGES, readContent, renderPages } = require('../build/lib/pages');
// eslint-disable-next-line import-x/no-useless-path-segments -- Home page module
const index = require('../build/lib/pages/index');
const { loadProjects } = require('../build/lib/projects');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://nellisarchitecture.com';
const read = (name) => readContent(ROOT, name);
const FOLLOW = read('site').follow;
const pageOf = (name) => PAGES.find((p) => p.content === name);
const count = (s, sub) => s.split(sub).length - 1;
const ldRaw = (html) => html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1];
const INDEX_ROBOTS = "<meta name='robots' content='index, follow, max-image-preview:large, "
  + "max-snippet:-1, max-video-preview:-1' />";

test('an empty SEO title falls back to the page title, then to the h1', () => {
  const expected = {
    index: 'Award-Winning Architect in Dubai',
    studio: 'Dubai Architecture Studio',
    people: 'People | Nellis Architecture Studio Team &amp; Experts',
    privacy: 'Privacy policy',
  };
  Object.entries(expected).forEach(([name, title]) => {
    const content = read(name);
    content.seo = { ...content.seo, title: '', og_title: '' };
    const t = seoTokens(content, pageOf(name));
    assert.equal(t.TITLE, title, name);
    assert.equal(t.OG_TITLE, title.replace(/"/g, '&quot;'), name);
  });
  assert.equal(seoTokens({ h1: 'H' }, { slug: 'x' }).TITLE, 'H');
});

const unHtml = (s) => s.replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const metaOf = (html, attr, key) => unHtml(
  html.match(new RegExp(`${attr}="${key}" content="([^"]*)"`))[1],
);

test('Home and Studio: the WebPage node and og tags equal the title and description', () => {
  const pages = renderPages(ROOT, '/news/');
  [['index', 'index.html'], ['studio', 'studio/index.html']].forEach(([name, file]) => {
    const { html } = pages.find((p) => p.file === file);
    const title = unHtml(html.match(/<title>([^<]+)<\/title>/)[1]);
    const description = metaOf(html, 'name', 'description');
    assert.equal(title, read(name).seo.title, name);
    assert.equal(metaOf(html, 'property', 'og:title'), title, name);
    assert.equal(metaOf(html, 'property', 'og:description'), description, name);
    const webPage = JSON.parse(ldRaw(html))['@graph'].find((n) => n['@type'] === 'WebPage');
    assert.deepEqual([webPage.name, webPage.description], [title, description], name);
  });
});

test('yoastPage writes the values as Yoast JSON: \\/ for a slash, < escaped, $ kept', () => {
  const schema = '{"@graph":[{"name":"{{NAME}}","description":"{{DESCRIPTION}}"}]}';
  const content = { seo: { title: 'A/B "q" $& <x>', description: 'd\\e' } };
  const out = yoastPage(schema, content, FOLLOW);
  const start = '{"@graph":[{"name":"A\\/B \\"q\\" $& \\u003cx>","description":"d\\\\e"},';
  assert.ok(out.startsWith(start));
  const [node, org] = JSON.parse(out)['@graph'];
  assert.deepEqual(node, { name: 'A/B "q" $& <x>', description: 'd\\e' });
  assert.equal(org['@type'], 'Organization');
});

test('og:title falls back to the SEO title', () => {
  const t = seoTokens({ h1: 'H', seo: { title: 'S' } }, { slug: 'x' });
  assert.equal(t.OG_TITLE, 'S');
  assert.equal(seoTokens({ seo: { title: 'S', og_title: 'O' } }, { slug: 'x' }).OG_TITLE, 'O');
});

test('canonical and og:url default to the absolute page URL', () => {
  ['studio', 'people', 'privacy'].forEach((slug) => {
    const t = seoTokens({ h1: 'H', seo: { canonical: '' } }, { slug });
    assert.equal(t.CANONICAL, `${DOMAIN}/${slug}/`);
    assert.equal(t.OG_URL, `${DOMAIN}/${slug}/`);
  });
});

test('Home canonical, og:url and URL are exactly the domain with one slash', () => {
  const t = seoTokens(read('index'), pageOf('index'));
  assert.equal(t.CANONICAL, `${DOMAIN}/`);
  assert.equal(t.OG_URL, `${DOMAIN}/`);
  assert.equal(pageUrl(''), `${DOMAIN}/`);
  const [{ html }] = renderPages(ROOT, '/news/n/');
  assert.ok(html.includes(`<link rel="canonical" href="${DOMAIN}/" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${DOMAIN}/" />`));
});

test('a custom canonical replaces the default', () => {
  const url = `${DOMAIN}/news/other/`;
  const t = seoTokens({ h1: 'H', seo: { canonical: url } }, { slug: 'studio' });
  assert.equal(t.CANONICAL, url);
  assert.equal(t.OG_URL, url);
});

test('a canonical on another host throws', () => {
  [
    'http://nellisarchitecture.com/', 'https://example.com/',
    'https://nellisarchitecture.com.evil/', 'https://nellisarchitecture.com', '/studio/',
  ].forEach((canonical) => {
    assert.throws(() => seoTokens({ h1: 'H', seo: { canonical } }, { slug: 'x' }), /canonical/);
  });
});

test('noindex replaces the robots line', () => {
  assert.equal(seoTokens({ h1: 'H', seo: {} }, { slug: 'x' }).ROBOTS, INDEX_ROBOTS);
  const t = seoTokens({ h1: 'H', seo: { noindex: true } }, { slug: 'x' });
  assert.equal(t.ROBOTS, '<meta name="robots" content="noindex">');
  const site = read('site');
  const content = { ...read('index'), seo: { ...read('index').seo, noindex: true } };
  const html = index.render(content, {
    site, newsHref: '/n/', page: pageOf('index'), projects: loadProjects(ROOT),
  });
  assert.ok(html.includes('  <meta name="robots" content="noindex">\n'));
  assert.ok(!html.includes("name='robots'"));
});

test('renderPages marks noindex pages for the sitemap', () => {
  renderPages(ROOT, '/n/').forEach((p) => assert.equal(p.noindex, false, p.file));
});

test('SEO values are escaped and $& stays literal', () => {
  const seo = {
    title: 'A "q" <b> & $&', og_title: 'O "q" <b> & $&', description: 'D "q" <b> & $&',
  };
  const t = seoTokens({ seo }, { slug: 'x' });
  assert.equal(t.TITLE, 'A "q" &lt;b&gt; &amp; $&amp;');
  assert.equal(t.OG_TITLE, 'O &quot;q&quot; &lt;b&gt; &amp; $&amp;');
  assert.equal(t.DESCRIPTION, 'D &quot;q&quot; &lt;b&gt; &amp; $&amp;');
  assert.equal(t.OG_DESCRIPTION, t.DESCRIPTION);
  const site = read('site');
  const html = index.render({ h1: 'H', seo }, {
    site, newsHref: '/n/', page: pageOf('index'), projects: loadProjects(ROOT),
  });
  assert.ok(html.includes(`<title>${t.TITLE}</title>`));
  assert.ok(html.includes(`<meta property="og:title" content="${t.OG_TITLE}" />`));
  assert.ok(html.includes(`<meta name="description" content="${t.DESCRIPTION}" />`));
  const canonical = seoTokens({ seo: { canonical: `${DOMAIN}/a"b<c>` } }, { slug: 'x' }).CANONICAL;
  assert.equal(canonical, `${DOMAIN}/a&quot;b&lt;c&gt;`);
});

/* News posts: see test/build-news.test.js (every real post renders one og:image on disk). */
test('og:image of the pages exists on disk', () => {
  const pages = renderPages(ROOT, '/news/x/').map((p) => [p.file, p.html]);
  pages.forEach(([file, html]) => {
    const m = html.match(/property="og:image" content="([^"]+)"/);
    assert.ok(m, file);
    assert.ok(m[1].startsWith(DOMAIN), file);
    assert.ok(fs.existsSync(path.join(ROOT, m[1].slice(DOMAIN.length))), m[1]);
  });
});

test('the Organization node carries exactly the six business properties', () => {
  const org = organization(FOLLOW);
  assert.deepEqual(Object.keys(org), ['@type', '@id', 'name', 'url', 'logo', 'sameAs']);
  assert.equal(org['@id'], `${DOMAIN}/#organization`);
  assert.equal(org.name, 'Nellis Architecture');
  assert.equal(org.url, `${DOMAIN}/`);
  assert.equal(org.logo, LOGO);
  assert.deepEqual(org.sameAs, sameAs(FOLLOW));
  assert.ok(!('telephone' in org));
  assert.ok(!('description' in org));
});

test('sameAs is the three social profiles and has one home in the content', () => {
  assert.deepEqual(sameAs(FOLLOW), [
    'https://www.instagram.com/nellis.architecture/',
    'https://www.linkedin.com/company/nellis-architecture/',
    'https://www.youtube.com/@NellisArchitecture',
  ]);
  const hits = execFileSync(
    'git',
    ['grep', '-l', sameAs(FOLLOW)[0], '--', 'build', 'build-news.js', 'content'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.deepEqual(hits.trim().split('\n'), ['content/pages/site.json']);
});

test('withOrganization appends one node and keeps the Yoast escaping', () => {
  const literal = '{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage"}]}';
  const out = withOrganization(literal, FOLLOW);
  assert.ok(out.startsWith(`${literal.slice(0, -2)},{"@type":"Organization"`));
  assert.ok(out.endsWith(']}'));
  assert.deepEqual(JSON.parse(out)['@graph'], [{ '@type': 'WebPage' }, organization(FOLLOW)]);
  assert.ok(out.includes('"@id":"https:\\/\\/nellisarchitecture.com\\/#organization"'));
  assert.ok(!out.includes('://'));
});

test('Home, /studio/ and /people/ append the node to the Yoast graph', () => {
  const pages = renderPages(ROOT, '/news/n/');
  ['index.html', 'studio/index.html', 'people/index.html'].forEach((file) => {
    const { html } = pages.find((p) => p.file === file);
    const raw = ldRaw(html);
    const graph = JSON.parse(raw)['@graph'];
    assert.deepEqual(graph.map((n) => n['@type']), [
      'WebPage', 'BreadcrumbList', 'WebSite', 'Organization',
    ], file);
    assert.deepEqual(graph[3], organization(FOLLOW), file);
    assert.equal(count(raw, '"@type":"Organization"'), 1, file);
    assert.ok(!raw.includes('://'), file);
    assert.ok(raw.startsWith('{"@context":"https:\\/\\/schema.org"'), file);
  });
});

test('no other registry page carries the node', () => {
  const four = ['index.html', 'studio/index.html', 'people/index.html', 'projects/index.html'];
  renderPages(ROOT, '/news/n/').forEach((p) => {
    assert.equal(ldRaw(p.html).includes('"@type":"Organization"'), four.includes(p.file), p.file);
  });
});

test('the build is current and idempotent: the registry pages match a new render', () => {
  renderPages(ROOT, '/news/').forEach((p) => {
    assert.equal(fs.readFileSync(path.join(ROOT, p.file), 'utf8'), p.html, p.file);
  });
});

test('customSchema: empty or missing adds nothing', () => {
  [undefined, '', '  \n '].forEach((raw) => assert.equal(customSchema(raw, 'f'), ''));
});

test('customSchema re-serializes an object or an array into one ld+json block', () => {
  assert.equal(
    customSchema('{\n  "@type": "Thing",\n  "name": "N"\n}', 'f'),
    '\t<script type="application/ld+json">{"@type":"Thing","name":"N"}</script>\n',
  );
  assert.equal(
    customSchema('[{"@type":"A"}, {"@type":"B"}]', 'f'),
    '\t<script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script>\n',
  );
});

test('customSchema throws on invalid JSON or a wrong type and names the file', () => {
  const file = 'content/pages/x.json';
  assert.throws(() => customSchema('{"a":', file), /pages\/x\.json: schema is not valid JSON/);
  ['"s"', '1', 'null', 'true'].forEach((raw) => {
    assert.throws(() => customSchema(raw, file), /x\.json: schema must be a JSON object/, raw);
  });
});

test('customSchema escapes < so </script> and <!-- cannot break out', () => {
  const out = customSchema('{"a":"</script><!-- x"}', 'f');
  assert.ok(out.includes('\\u003c/script>\\u003c!-- x'), out);
  assert.equal(count(out, '</script>'), 1);
  assert.ok(!out.includes('<!--'));
});

test('seoTokens fills SCHEMA_EXTRA from seo.schema and names the page file on error', () => {
  assert.equal(seoTokens({ h1: 'H', seo: {} }, { slug: 'x', content: 'x' }).SCHEMA_EXTRA, '');
  const t = seoTokens({ h1: 'H', seo: { schema: '{"a":1}' } }, { slug: 'x', content: 'x' });
  assert.equal(t.SCHEMA_EXTRA, '\t<script type="application/ld+json">{"a":1}</script>\n');
  assert.throws(
    () => seoTokens({ h1: 'H', seo: { schema: '[' } }, pageOf('studio')),
    /content\/pages\/studio\.json: schema is not valid JSON/,
  );
});
