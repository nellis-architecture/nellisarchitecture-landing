const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bodyLines } = require('../build/lib/pages/privacy');
const studio = require('../build/lib/pages/studio');
const people = require('../build/lib/pages/people');
const project = require('../build/lib/pages/project');
const { renderPages, readSite, validateSite } = require('../build/lib/pages');
const { loadProjects } = require('../build/lib/projects');
const { loadPosts } = require('../build-news');

test('bodyLines ends every text line with <br><br>, except the last', () => {
  assert.equal(bodyLines('one\ntwo\nlast'), 'one<br><br>\ntwo<br><br>\nlast');
  assert.equal(bodyLines('only'), 'only');
});

test('bodyLines keeps blank lines blank and ignores outer blank lines', () => {
  assert.equal(bodyLines('\n\na\n\n \nb\n\n'), 'a<br><br>\n\n\nb');
  assert.equal(bodyLines(''), '');
  assert.equal(bodyLines(undefined), '');
});

test('bodyLines escapes text and keeps a space before the break', () => {
  assert.equal(bodyLines('>mail & <b>\nend'), '&gt;mail &amp; &lt;b&gt;<br><br>\nend');
  assert.equal(bodyLines('that \nend'), 'that <br><br>\nend');
  assert.equal(bodyLines('a\r\nb'), 'a<br><br>\nb');
});

const ROOT = path.join(__dirname, '..');
const count = (s, sub) => s.split(sub).length - 1;
const POSTS = loadPosts(path.join(ROOT, 'content', 'news'));

test('renderPages writes each page to its folder and fills every token', () => {
  const pages = renderPages(ROOT, '/news/x-$&/');
  assert.deepEqual(
    pages.map((p) => p.file),
    [
      'index.html', 'studio/index.html', 'people/index.html', 'privacy/index.html',
      'projects/index.html', 'contact/index.html',
      'projects/architecture/index.html', 'projects/interior-design/index.html',
      'projects/landscape/index.html', 'projects/master-planning/index.html',
    ],
  );
  pages.forEach((p) => {
    assert.ok(!p.html.includes('{{'), p.file);
  });
});

const NAV_PROJECTS = new RegExp('<a href="([^"]*)" class="(?:projectPage|nav-item)"[^>]*>'
  + '\\s*(?:<li class="projectPage">)?Projects<', 'g');

function assertNav(html, name) {
  const hrefs = [...html.matchAll(NAV_PROJECTS)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, name);
  hrefs.forEach((h) => assert.equal(h, '/projects/', name));
  assert.match(html, /<a href="\/" class="logo">/, name);
}

test('every page links the nav Projects item to /projects/ and the logo to /', () => {
  const pages = renderPages(ROOT, '/news/', undefined, POSTS);
  assert.ok(pages.some((p) => p.file === 'news/index.html'));
  pages.forEach((p) => assertNav(p.html, p.file));
  const [entry] = loadProjects(ROOT);
  const siteFile = path.join(ROOT, 'content', 'pages', 'site.json');
  const site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
  assertNav(project.render(entry, { site, newsHref: '/news/n/' }), entry.url);
  const news = fs.readFileSync(path.join(ROOT, 'news', POSTS[0].slug, 'index.html'), 'utf8');
  assertNav(news, `news/${POSTS[0].slug}/`);
});

const NAV_CONTACT = new RegExp('<a href="([^"]*)" class="(?:contactPage|nav-item)"[^>]*>'
  + '\\s*(?:<li class="contactPage">)?Contact<', 'g');

function assertContact(html, name) {
  const hrefs = [...html.matchAll(NAV_CONTACT)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, name);
  hrefs.forEach((h) => assert.equal(h, '/contact/', name));
  assert.ok(!html.includes('Contect.addEventListener'), name);
}

test('every page links the nav Contact item to /contact/ with no click handler', () => {
  renderPages(ROOT, '/news/', undefined, POSTS).forEach((p) => assertContact(p.html, p.file));
  const [entry] = loadProjects(ROOT);
  const siteFile = path.join(ROOT, 'content', 'pages', 'site.json');
  const site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
  assertContact(project.render(entry, { site, newsHref: '/news/n/' }), entry.url);
  const news = fs.readFileSync(path.join(ROOT, 'news', POSTS[0].slug, 'index.html'), 'utf8');
  assertContact(news, `news/${POSTS[0].slug}/`);
});

test('renderPages output has no relative asset or page links', () => {
  renderPages(ROOT, '/news/x/', undefined, POSTS).forEach((p) => {
    assert.doesNotMatch(p.html, /(src|href)=["']wp-content\//, p.file);
    assert.doesNotMatch(p.html, /url\(["']?wp-content\//, p.file);
    assert.doesNotMatch(p.html, /href=["'][^"'/:#]*\.html/, p.file);
    assert.doesNotMatch(p.html, /(src|href|data-src)=["'][^"']*%3F/i, p.file);
  });
});

test('404.html links only to absolute paths, anchors or full URLs', () => {
  const html = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']*)["']|url\(["']?([^"')]*)/g)]
    .map((m) => m[1] || m[2]);
  assert.ok(refs.length > 0);
  refs.forEach((ref) => assert.match(ref, /^(\/|#|https?:|data:)/, ref));
});

const img = (name) => ({
  src: `/wp-content/uploads/pages/${name}.png`, alt: `${name} "alt"`, width: 10, height: 20,
});

function studioFixture() {
  return {
    h1: 'Hidden H1',
    intro: {
      title: 'Intro <T> "q"',
      subtitle: 'Sub & title',
      photo: img('photo'),
      quote: 'Line one\nLine two',
      quote_author: 'Author $&',
      paragraphs: ['Para one', 'Para two'],
      big_image: img('big'),
    },
    services: {
      title: 'Services T',
      button: 'Go',
      items: [{ title: 'Svc A', link: 'index.html#a b' }, { title: 'Svc B', link: 'x"y' }],
    },
    values: {
      title: 'Values T',
      items: [{ title: 'VAL A', text: 'Text a & b' }, { title: 'VAL B', text: 'Text b' }],
    },
    founder: {
      title: 'Founder T',
      quote: '"Quote"',
      photo: img('founder'),
      label: 'Label',
      name: 'Name',
      bio: 'Bio',
      text: 'Text',
    },
  };
}

test('studio render puts each value in its places', () => {
  const siteFile = path.join(ROOT, 'content', 'pages', 'site.json');
  const site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
  const html = studio.render(studioFixture(), {
    site, newsHref: 'news/n/index.html', page: { slug: 'x' },
  });
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes('<h1 class="visually-hidden">Hidden H1</h1>'));
  assert.ok(html.includes('site-containerStudioPageIn Intro &lt;T&gt; &quot;q&quot;">'));
  assert.ok(html.includes('FirstBlockLink">Intro &lt;T&gt; "q"</a>'));
  assert.ok(html.includes('<h1>Intro &lt;T&gt; "q"</h1>'));
  ['Services T', 'Values T', 'Founder T'].forEach((t) => {
    assert.equal(count(html, `>${t}</a>`), 1, t);
    assert.equal(count(html, `>${t}</h2>`), 1, t);
  });
  assert.equal(count(html, '<h3>VAL A:</h3>'), 2);
  assert.equal(count(html, 'Text a &amp; b'), 2);
  assert.equal(count(html, '        Para one      </p>'), 2);
  assert.equal(count(html, '        Para two      </p>'), 2);
  assert.ok(html.includes('Line one<br>Line two        <br /><br />-Author $&amp;      </div>'));
  assert.ok(html.includes('<span>Sub &amp; title</span>'));
  assert.ok(html.includes('href="index.html#a b"'));
  assert.ok(html.includes('href="x&quot;y"'));
  assert.equal(count(html, '                Go\n'), 2);
  assert.ok(html.includes('<img class="photo1" src="/wp-content/uploads/pages/founder.png" '
    + 'alt="founder &quot;alt&quot;" decoding="async" loading="lazy"'));
  assert.ok(html.includes('<img src="/wp-content/uploads/pages/photo.png" '
    + 'alt="photo &quot;alt&quot;" decoding="async" loading="eager" fetchpriority="high"'));
  assert.ok(html.includes('src="/wp-content/uploads/pages/big.png"'));
  assert.equal(count(html, 'fetchpriority="high"'), 1);
  assert.ok(html.includes('href="/news/" class="newsPage"'));
  assert.ok(html.includes(`${' '.repeat(16)}<div class="partner">`));
  assert.ok(html.includes('"Quote"      </p>'));
});

test('quoteLines joins lines with <br>, escapes and trims', () => {
  assert.equal(studio.quoteLines('a\r\nb'), 'a<br>b');
  assert.equal(studio.quoteLines('only'), 'only');
  assert.equal(studio.quoteLines('\na\n\nb\n'), 'a<br><br>b');
  assert.equal(studio.quoteLines('<a> & b'), '&lt;a&gt; &amp; b');
  assert.equal(studio.quoteLines(undefined), '');
});

test('values indents the first item and the next items as the theme loop does', () => {
  const items = [{ title: 'A', text: 'x' }, { title: 'B', text: 'y' }];
  const lines = studio.values(items, 20, 22, 12).split('\n');
  assert.deepEqual(lines, [
    `${' '.repeat(20)}<div class="sprintLine__item">`,
    `${' '.repeat(14)}<h3>A:</h3>`,
    `${' '.repeat(14)}<p>`,
    `${' '.repeat(16)}x${' '.repeat(14)}</p>`,
    `${' '.repeat(12)}</div>`,
    `${' '.repeat(22)}<div class="sprintLine__item">`,
    `${' '.repeat(14)}<h3>B:</h3>`,
    `${' '.repeat(14)}<p>`,
    `${' '.repeat(16)}y${' '.repeat(14)}</p>`,
    `${' '.repeat(12)}</div>`,
  ]);
  assert.equal(studio.values([], 20, 22, 12), '');
});

test('services renders one block per item and nothing for an empty list', () => {
  const html = studio.services({ button: 'Go', items: [{ title: 'A', link: 'a' }] });
  assert.ok(html.startsWith(`${' '.repeat(16)}<a href="a" class="SechondBlock__project_container">`
    + '\n            <div'));
  assert.ok(html.endsWith(`${' '.repeat(10)}</a>`));
  assert.equal(studio.services({ button: 'Go', items: [] }), '');
});

function peopleFixture(list) {
  return {
    h1: 'Hidden & H1',
    intro: { title: 'People <T>', paragraphs: ['Para one', 'Para "two"'], image: img('team') },
    people: list,
  };
}

const person = (n) => ({
  name: `Name ${n}`, role: `Role ${n}`, photo: img(`p${n}`), bio: `Bio ${n}`,
});

test('people render puts each value in its places', () => {
  const site = readSite(ROOT);
  const bio = 'Line one & $& "q"\n\nLine <two>';
  const list = [person(1), { ...person(2), name: 'Ann $&', bio }, person(3)];
  const html = people.render(peopleFixture(list), {
    site, newsHref: 'news/n/index.html', page: { slug: 'x' },
  });
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes('<h1 class="visually-hidden">Hidden &amp; H1</h1>'));
  assert.ok(html.includes('<h1>People &lt;T&gt;</h1>'));
  assert.ok(html.includes('          Para "two"        </p>'));
  assert.ok(html.includes('src="/wp-content/uploads/pages/team.png" '
    + 'alt="team &quot;alt&quot;" decoding="async" loading="eager" fetchpriority="high"'));
  assert.equal(count(html, 'fetchpriority="high"'), 1);
  assert.ok(html.includes('href="/news/" class="newsPage"'));
  assert.ok(html.includes(`\n${' '.repeat(14)}<div class="partner">`));
  assert.ok(!html.includes(`${' '.repeat(16)}<div class="partner">`));
  assert.equal(count(html, '<div class="accord__item">'), 3);
  assert.ok(html.indexOf('Name 1') < html.indexOf('Ann $&amp;'));
  assert.ok(html.indexOf('Ann $&amp;') < html.indexOf('Name 3'));
  assert.ok(html.includes('<span class="accord__itemDol">Role 2</span>'));
  assert.ok(html.includes('Line one &amp; $&amp; "q"\n\nLine &lt;two&gt;          </div>'));
  assert.ok(html.includes('src="/wp-content/uploads/pages/p3.png" '
    + 'alt="p3 &quot;alt&quot;"'));
});

test('people renders items with the theme separator and nothing for an empty list', () => {
  const html = people.people([person(1), person(2)]);
  assert.ok(html.startsWith(`${' '.repeat(8)}<div class="accord__item">`));
  assert.ok(html.includes('        </div>\n\n\n      \n        <div class="accord__item">'));
  assert.ok(html.endsWith(`${' '.repeat(8)}</div>`));
  assert.equal(people.people([]), '');
});

test('people render works with no people', () => {
  const site = readSite(ROOT);
  const html = people.render(peopleFixture([]), {
    site, newsHref: 'news/n/index.html', page: { slug: 'x' },
  });
  assert.ok(!html.includes('{{'));
  assert.equal(count(html, '<div class="accord__item">'), 0);
  assert.ok(html.includes('<section class="PeopleAccord">'));
});

test('studio render adds a filled image title and nothing for an empty title', () => {
  const opts = { site: readSite(ROOT), newsHref: 'n', page: { slug: 'x' } };
  const content = studioFixture();
  content.founder.photo.title = 'Founder "t"';
  content.intro.photo.title = 'Photo t';
  const html = studio.render(content, opts);
  assert.ok(html.includes('alt="founder &quot;alt&quot;" title="Founder &quot;t&quot;" '
    + 'decoding="async"'));
  assert.ok(html.includes('alt="photo &quot;alt&quot;" title="Photo t" '));
  content.founder.photo.title = ' ';
  assert.ok(studio.render(content, opts)
    .includes('alt="founder &quot;alt&quot;" decoding="async"'));
  assert.ok(!studio.render(studioFixture(), opts).includes(' title='));
});

test('people render adds a filled person photo title', () => {
  const list = [{ ...person(1), photo: { ...img('p1'), title: 'P1 t' } }];
  const html = people.render(peopleFixture(list), {
    site: readSite(ROOT), newsHref: 'n', page: { slug: 'x' },
  });
  assert.ok(html.includes('alt="p1 &quot;alt&quot;" title="P1 t" '));
});

test('intro renders one <p> per paragraph and escapes text', () => {
  assert.equal(people.intro(['a & b']), '        <p>\n          a &amp; b        </p>');
  assert.equal(
    people.intro(['a', 'b']),
    '        <p>\n          a        </p>\n        <p>\n          b        </p>',
  );
  assert.equal(people.intro([]), '');
});

['index-projects', 'current-project'].forEach((name) => {
  test(`${name} partial closes every div it opens`, () => {
    const html = fs.readFileSync(path.join(ROOT, `build/lib/partials/${name}.html`), 'utf8');
    const matches = (re) => (html.match(re) || []).length;
    assert.equal(matches(/<div[\s>]/g), matches(/<\/div>/g));
  });
});

const OK_NAV = [{ label: 'Projects', link: '/projects/' }];
const OK_FOLLOW = [{ label: 'Instagram', link: 'https://www.instagram.com/nellis.architecture/' }];
const siteOf = (over) => ({ nav: OK_NAV, follow: OK_FOLLOW, ...over });

const navErrors = (nav) => validateSite(siteOf({ nav }));
const followErrors = (follow) => validateSite(siteOf({ follow }));
const NOT_A_LINK = ['nav[0]: "link" must start with / or http(s)://'];
const NOT_AN_OBJECT = ['nav[0]: expected an object with "label" and "link"'];

test('validateSite accepts the site.json of the repo', () => {
  assert.deepEqual(validateSite(readSite(ROOT)), []);
  assert.deepEqual(validateSite(siteOf()), []);
  assert.deepEqual(navErrors([{ label: ' X ', link: ' /projects/ ' }]), []);
});

test('validateSite refuses a missing or empty nav', () => {
  assert.deepEqual(validateSite(siteOf({ nav: [] })), ['nav: expected a non-empty array']);
  assert.deepEqual(validateSite(siteOf({ nav: 'x' })), ['nav: expected a non-empty array']);
  assert.deepEqual(validateSite({ follow: OK_FOLLOW }), ['nav: expected a non-empty array']);
});

test('validateSite refuses a missing or empty follow', () => {
  assert.deepEqual(validateSite(siteOf({ follow: [] })), ['follow: expected a non-empty array']);
  assert.deepEqual(validateSite({ nav: OK_NAV }), ['follow: expected a non-empty array']);
});

test('validateSite refuses an empty label', () => {
  assert.deepEqual(navErrors([{ label: ' ', link: '/x/' }]), ['nav[0]: "label" is empty']);
  assert.deepEqual(followErrors([{ link: 'https://e.com/' }]), ['follow[0]: "label" is empty']);
});

test('validateSite refuses an empty link', () => {
  assert.deepEqual(navErrors([{ label: 'X', link: ' ' }]), ['nav[0]: "link" is empty']);
  assert.deepEqual(followErrors([{ label: 'X' }]), ['follow[0]: "link" is empty']);
});

test('validateSite refuses a link that is not a path or an http(s) URL', () => {
  ['projects/', 'ftp://x', '/a b/', '/x/../y/', 'mailto:a@b.c'].forEach((link) => {
    assert.deepEqual(navErrors([{ label: 'X', link }]), NOT_A_LINK, link);
  });
});

test('validateSite refuses an item that is not an object', () => {
  assert.deepEqual(navErrors([null]), NOT_AN_OBJECT);
  assert.deepEqual(followErrors(['x']), ['follow[0]: expected an object with "label" and "link"']);
});

test('readSite throws one error that names content/pages/site.json and the item', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.mkdirSync(path.join(dir, 'content', 'pages'), { recursive: true });
  const bad = siteOf({ nav: [...OK_NAV, ...OK_NAV, { label: ' ', link: '/x/' }] });
  fs.writeFileSync(path.join(dir, 'content', 'pages', 'site.json'), JSON.stringify(bad));
  assert.throws(() => readSite(dir), {
    message: 'content/pages/site.json:\nnav[2]: "label" is empty',
  });
  assert.deepEqual(readSite(ROOT).nav.length, 5);
  fs.rmSync(dir, { recursive: true });
});
