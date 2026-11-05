const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  categoryHref, loadProjects, hashTarget, description, earlyScript,
} = require('../build/lib/projects');
const project = require('../build/lib/pages/project');
const { head } = require('../build/lib/chrome');
const { fill, loadPartial } = require('../build/lib/html');
const { renderPages } = require('../build/lib/pages');
const { sitemap, pruneProjects } = require('../build-news');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://nellisarchitecture.com';
const LIST = loadProjects(ROOT);
const byName = (name) => LIST.find((e) => e.name === name);
const projectUrl = (name) => byName(name).url;
const count = (s, sub) => s.split(sub).length - 1;
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pages', 'site.json'), 'utf8'));
const renderEntry = (e) => project.render(e, { site, projects: LIST });

const proj = (over = {}) => ({
  area: 'Palm Jumeirah',
  region: 'Dubai, UAE',
  text_1: ['First &amp; text', 'Second'],
  text_2: ['Two'],
  image_2: [{ src: '/wp-content/uploads/i2.jpg' }],
  facts: [{ label: 'Type:', value: 'Villa' }],
  category: 'architecture',
  type: 'residential',
  hero: '/wp-content/uploads/hero.jpg',
  slider_1: [{ src: '/wp-content/uploads/s1.jpg' }],
  slider_2: [{ src: '/wp-content/uploads/s2.jpg' }],
  ...over,
});
const entry = (name, over) => ({
  name, p: proj(over), slug: 'x', cat: 'architecture', url: '/projects/architecture/x/',
});
/* A test project rendered in the place of Zoya: its grid item is the open one. */
const fake = (name, over) => ({ ...entry(name, over), url: projectUrl('Zoya') });
/* The open project panel only, without the grid and the kept second panel. */
const current = (html) => html.slice(
  html.search(/<div class="currentProject[ "]/),
  html.indexOf('<div class="currentProject2">'),
);

test('every real project URL comes from its category and slug', () => {
  LIST.forEach((e) => assert.equal(e.url, `/projects/${e.p.category}/${e.p.slug}/`));
});

test('categoryHref points at the category page', () => {
  assert.equal(categoryHref('architecture'), '/projects/architecture/');
  assert.equal(categoryHref('master-planning'), '/projects/master-planning/');
  assert.equal(categoryHref('interior-design'), '/projects/interior-design/');
});

test('description strips tags, decodes entities, collapses space and cuts at a word', () => {
  assert.equal(description('A &amp; B</br>\r\n\r\n C &#39;x&#x27; &nbsp;'), "A & B C 'x'");
  assert.equal(description(undefined), '');
  const long = `${'word '.repeat(40)}end`;
  const cut = description(long);
  assert.ok(cut.length <= 155);
  assert.ok(long.startsWith(cut));
  assert.match(cut, /word$/);
  assert.equal(description('aaaa bbbb, cccc', 11), 'aaaa bbbb');
});

test('project page has its own title, description, canonical and one og:image', () => {
  const html = renderEntry(fake('A "Q" <b>', {
    text_1: ['Say "hi" &amp; <br>bye'],
  }));
  const name = 'A "Q" &lt;b&gt;';
  const desc = 'Say &quot;hi&quot; &amp; bye';
  assert.ok(html.includes(`<title>${name} | Palm Jumeirah | Nellis Architecture</title>`));
  assert.ok(html.includes(`<meta name="description" content="${desc}" />`));
  assert.ok(html.includes(`<meta property="og:description" content="${desc}" />`));
  const url = `${DOMAIN}/projects/architecture/zoya/`;
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
  assert.equal(count(html, 'property="og:image'), 1);
  assert.ok(html.includes(
    `<meta property="og:image" content="${DOMAIN}/wp-content/uploads/hero.jpg">`,
  ));
  assert.ok(!html.includes('article:modified_time'));
  assert.ok(html.includes('alt="A &quot;Q&quot; &lt;b&gt;"'));
  assert.ok(html.includes(`font-weight: 200;">${name}</h2>`));
  assert.ok(!html.includes('{{'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1]);
  assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(ld['@graph'][0].isPartOf, undefined);
  assert.equal(ld['@graph'][0].url, url);
});

test('title falls back to the region, then to the name only', () => {
  const noArea = proj({ area: '' });
  assert.equal(project.title('W44', noArea), 'W44 | Dubai, UAE | Nellis Architecture');
  const noPlace = proj({ area: '', region: '' });
  assert.equal(project.title('N', noPlace), 'N | Nellis Architecture');
});

test('every project og:image exists on disk', () => {
  LIST.forEach((e) => {
    const src = project.ogImage(e.p).match(/content="([^"]+)"/)[1].slice(DOMAIN.length);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `${e.name}: ${src}`);
  });
});

test('a video hero renders a video and og:image uses the first slide', () => {
  const html = renderEntry(fake('V', { hero: '/wp-content/uploads/v.mp4' }));
  assert.ok(html.includes('<video autoplay muted loop playsinline>'
    + '<source src="/wp-content/uploads/v.mp4"'));
  assert.ok(html.includes(
    `<meta property="og:image" content="${DOMAIN}/wp-content/uploads/s1.jpg">`,
  ));
  assert.equal(project.ogImage(proj({ hero: '/v.mp4', slider_1: [] })), '');
});

test('empty and missing texts render no block and never "undefined"', () => {
  const tela = current(renderEntry(byName('Tela')));
  assert.ok(!tela.includes('undefined'));
  assert.equal(count(tela, 'class="currentProject_container projText2"'), 1);
  assert.equal(project.texts([''], 'projText3'), '');
  assert.ok(!project.texts(['a\r\n\r\nb'], 'x').includes('\r'));
  assert.equal(project.texts(undefined, 'projText3'), '');
  const html = current(renderEntry(fake('E', { text_2: [' ', ''], slider_2: [] })));
  assert.ok(!html.includes('projText2'));
  assert.ok(!html.includes('projText3'));
  assert.equal((html.match(/<div class="swiper[" ]/g) || []).length, 1);
  assert.ok(!html.includes('undefined'));
});

test('slider2 gets curpadslide only when text 3 is empty', () => {
  assert.ok(renderEntry(fake('A')).includes('<div class="swiper curpadslide">'));
  assert.ok(!renderEntry(fake('A', { text_3: ['T3'] })).includes('curpadslide'));
});

test('typeSet renders the label/value pairs', () => {
  const set = [{ label: 'a', value: 'b' }, { label: 'c', value: 'd' }];
  assert.equal(count(project.typeSet(set), '<div class="item">'), 2);
  assert.ok(project.typeSet(set).includes('<div class="item-name">c</div>'
    + '<div class="item-char">d</div>'));
  assert.equal(project.typeSet([]), '');
  assert.equal(project.typeSet(undefined), '');
});

test('the page keeps the overlay order of blocks', () => {
  const html = current(renderEntry(fake('O', {
    text_3: ['T3'], last_images: [{ src: '/wp-content/uploads/last.jpg' }],
  })));
  const order = [
    'hero.jpg', 's1.jpg', 'projText1', 'i2.jpg', 'projText2', 's2.jpg', 'projText3', 'last.jpg',
    'item-name',
  ];
  const at = order.map((s) => html.indexOf(s));
  at.forEach((i, n) => assert.ok(i > -1, order[n]));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('the breadcrumb links Home, the hub and the category page', () => {
  const html = renderEntry(byName('Orel'));
  assert.ok(html.includes('<a href="/">Home</a>'));
  assert.ok(html.includes('<a href="/projects/">Projects</a>'));
  assert.ok(html.includes('<a href="/projects/master-planning/">Master Planning</a>'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)[1]);
  assert.deepEqual(ld['@graph'][1].itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${DOMAIN}/`],
    [2, 'Projects', `${DOMAIN}/projects/`],
    [3, 'Master Planning', `${DOMAIN}/projects/master-planning/`],
    [4, 'Orel', undefined],
  ]);
  assert.ok(html.includes('<span aria-current="page">Orel</span>'));
});

const OLD_OG = [
  `  <meta property="og:image" content="${DOMAIN}/wp-content/themes/nellis/assets/img/minis.png">`,
  '  <meta property="og:image:width" content="968">',
  '  <meta property="og:image:height" content="504">',
].join('\n');

test('head without OG_IMAGE renders exactly the old head', () => {
  const values = {
    BEFORE: '',
    TITLE: 'T',
    ROBOTS: 'R',
    DESCRIPTION: 'D',
    CANONICAL: 'C',
    OG_TYPE: 'website',
    OG_TITLE: 'OT',
    OG_DESCRIPTION: 'OD',
    OG_URL: 'OU',
    MODIFIED_TIME: 'M',
    SCHEMA: '{}',
  };
  const old = fill(loadPartial('head').replace('{{OG_IMAGE}}', OLD_OG)
    .replace('{{EARLY_SCRIPT}}', '').replace('{{PRELOAD}}', '')
    .replace('{{SCHEMA_EXTRA}}', '')
    .replace('{{IMAGES_CSS}}', loadPartial('images-css'))
    .replace('{{ANALYTICS}}', loadPartial('analytics')), values);
  assert.equal(head(values), old);
});

test('the other pages keep the default og:image', () => {
  renderPages(ROOT).filter((p) => !p.file.startsWith('projects/')).forEach((p) => {
    assert.equal(count(p.html, 'property="og:image"'), 1, p.file);
    assert.ok(p.html.includes(OLD_OG), p.file);
  });
});

test('sitemap lists the project pages with priority 0.7', () => {
  const xml = sitemap([], [], LIST);
  const listed = LIST.filter((e) => !e.p.seo?.noindex);
  assert.equal(count(xml, `<loc>${DOMAIN}/projects/`), listed.length);
  assert.ok(xml.includes(
    `<url><loc>${DOMAIN}/projects/architecture/zoya/</loc><priority>0.7</priority></url>`,
  ));
});

test('hashTarget finds the project for an old #proj= link', () => {
  const map = Object.fromEntries(LIST.map((e) => [e.name, e.url]));
  assert.equal(hashTarget('#proj=Zoya', map), '/projects/architecture/zoya/');
  assert.equal(
    hashTarget('#proj=evergreens%20hotel', map),
    '/projects/master-planning/evergreens-hotel/',
  );
  assert.equal(hashTarget('#proj=%20WEST LINKS%20', map), '/projects/master-planning/west-links/');
  assert.equal(hashTarget('#proj=%E0', map), null);
  assert.equal(hashTarget('#proj=Nope', map), null);
  assert.equal(hashTarget('#proj=', map), null);
  assert.equal(hashTarget('#architecture', map), null);
  assert.equal(hashTarget('', map), null);
});

test('hashTarget finds the category page for an old /#<category> link only with cats', () => {
  const cats = {
    architecture: '/projects/architecture/',
    'master planning': '/projects/master-planning/',
    'interior design': '/projects/interior-design/',
    landscape: '/projects/landscape/',
  };
  assert.equal(hashTarget('#architecture', {}, cats), '/projects/architecture/');
  assert.equal(hashTarget('#master%20planning', {}, cats), '/projects/master-planning/');
  assert.equal(hashTarget('#Interior%20Design', {}, cats), '/projects/interior-design/');
  assert.equal(hashTarget('#%20landscape%20', {}, cats), '/projects/landscape/');
  const misses = ['#master-planning', '#%E0', '#', '#invite_token=abc', '#all', '', 'architecture'];
  misses.forEach((h) => {
    assert.equal(hashTarget(h, {}, cats), null, h);
  });
  assert.equal(hashTarget('#proj=architecture', {}, cats), null);
});

test('pruneProjects deletes only stale folders in projects/ and keeps categories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  const mk = (rel) => fs.mkdirSync(path.join(root, rel), { recursive: true });
  [
    'projects/architecture/zoya', 'projects/architecture/old', 'projects/landscape',
    'projects/gone/x', 'news/keep', 'projects-other/x',
  ].forEach(mk);
  fs.writeFileSync(path.join(root, 'projects', 'file.txt'), 'x');
  fs.writeFileSync(path.join(root, 'projects', 'landscape', 'index.html'), 'x');
  fs.writeFileSync(path.join(root, 'projects', 'architecture', 'index.html'), 'x');
  pruneProjects(root, [{ cat: 'architecture', slug: 'zoya' }]);
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  assert.ok(exists('projects/architecture/zoya'));
  assert.ok(!exists('projects/architecture/old'));
  assert.ok(exists('projects/landscape/index.html'));
  assert.ok(exists('projects/architecture/index.html'));
  assert.ok(!exists('projects/gone'));
  assert.ok(exists('projects/file.txt'));
  assert.ok(exists('news/keep'));
  assert.ok(exists('projects-other/x'));
});

function runEarly(hash, navType) {
  const js = earlyScript(LIST).replace(/^\s*<script>|<\/script>\s*$/g, '');
  const went = [];
  const listeners = {};
  const location = { hash, replace: (u) => went.push(u) };
  vm.runInNewContext(js, {
    location,
    performance: { getEntriesByType: () => [{ type: navType }] },
    window: {
      performance: true,
      addEventListener: (ev, fn) => {
        listeners[ev] = fn;
      },
    },
  });
  const change = (h) => {
    location.hash = h;
    listeners.hashchange();
  };
  return { went, change };
}

test('the Home early script always sends #proj= links to the project page', () => {
  ['navigate', 'reload', 'back_forward'].forEach((type) => {
    assert.deepEqual(runEarly('#proj=Evergreens%20Hotel', type).went, [
      '/projects/master-planning/evergreens-hotel/',
    ], type);
  });
  ['#proj=%E0', '#proj=Nope', '#', '#invite_token=abc', '#all', ''].forEach((h) => {
    assert.deepEqual(runEarly(h, 'navigate').went, [], h);
  });
});

test('the Home early script sends an old /#<category> link on load to the category page', () => {
  ['navigate', 'reload', 'back_forward'].forEach((type) => {
    assert.deepEqual(runEarly('#architecture', type).went, ['/projects/architecture/'], type);
    assert.deepEqual(
      runEarly('#master%20planning', type).went,
      ['/projects/master-planning/'],
      type,
    );
  });
});

test('the Home early script redirects a later #proj= hash change with replace', () => {
  const { went, change } = runEarly('', 'navigate');
  change('#architecture');
  change('#invite_token=abc');
  assert.deepEqual(went, []);
  change('#proj=Zoya');
  assert.deepEqual(went, ['/projects/architecture/zoya/']);
});

test('only Home has the early script, before static-backend.js', () => {
  renderPages(ROOT).forEach((p) => {
    const at = p.html.indexOf('hashTarget(location.hash');
    if (p.file === 'index.html') {
      assert.ok(at > -1 && at < p.html.indexOf('/js/static-backend.js'));
    } else {
      assert.equal(at, -1, p.file);
    }
  });
  assert.ok(!renderEntry(byName('Zoya')).includes('hashTarget'));
});

test('only project pages load the project switch, once, before the footer scripts', () => {
  const tag = '<script src="/js/project-switch.js"></script>';
  renderPages(ROOT).forEach((p) => {
    assert.equal(count(p.html, tag), 0, p.file);
  });
  LIST.forEach((e) => {
    const html = renderEntry(e);
    assert.equal(count(html, tag), 1, e.name);
    assert.ok(html.indexOf(tag) > html.indexOf('<div class="currentProject2">'));
    assert.ok(html.indexOf(tag) < html.indexOf('swiperLib.js'));
  });
});

const LINK = new RegExp('<div class="project__item">\\s*'
  + '<a class="project__link no-prefetch" href="([^"]+)" aria-label="([^"]+)"></a>'
  + '[\\s\\S]*?<span class="project__name">([^<]+)</span>', 'g');
const links = (html) => [...html.matchAll(LINK)];

test('every Home grid item links to its project page', () => {
  const { html } = renderPages(ROOT).find((p) => p.file === 'index.html');
  const found = links(html);
  assert.equal(count(html, '<div class="project__item">'), LIST.length);
  assert.equal(found.length, LIST.length);
  found.forEach(([, href, label, name]) => {
    assert.equal(href, projectUrl(name), name);
    assert.equal(label, name);
  });
});

test('every filter fragment item links to its project page', () => {
  const dir = path.join(ROOT, 'data', 'filters');
  fs.readdirSync(dir).forEach((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const found = links(html);
    assert.equal(found.length, count(html, '<div class="project__item">'), f);
    found.forEach(([, href, label, name]) => {
      assert.equal(href, projectUrl(name), `${f}: ${name}`);
      assert.equal(label, name);
    });
  });
});

const divsOpen = (html) => (html.match(/<div[\s>]/g) || []).length
  - (html.match(/<\/div>/g) || []).length;
const HOME = renderPages(ROOT).find((p) => p.file === 'index.html').html;
const PROJECT_LINK = /<a class="project__link no-prefetch" href="([^"]+)"( aria-current="page")?/g;

test('every project page shows its project open next to the thumbnail column', () => {
  const urls = LIST.map((e) => e.url).sort();
  LIST.forEach((e) => {
    const html = renderEntry(e);
    assert.ok(html.includes('<div class="centerProject centerMini">'), e.name);
    assert.ok(html.includes('<div class="currentProject project__openned">'), e.name);
    const found = [...html.matchAll(PROJECT_LINK)];
    assert.deepEqual(found.map((m) => m[1]).sort(), urls, e.name);
    assert.deepEqual(found.filter((m) => m[2]).map((m) => m[1]), [e.url], e.name);
    assert.equal(count(html, '<div class="project__item zeroOpac">'), LIST.length - 1, e.name);
    assert.equal(count(html, '<div class="project__item">'), 1, e.name);
    assert.equal(count(html, 'class="projectPL PLoppened"'), 1, e.name);
    const own = html.indexOf(`href="${e.url}" aria-current="page"`);
    const item = html.slice(own, html.indexOf('PLoppened', own));
    assert.ok(own > -1 && !item.includes('<div class="project__item'), e.name);
    assert.equal(divsOpen(current(html)), 0, e.name);
    assert.equal(divsOpen(html), divsOpen(HOME), e.name);
    assert.ok(!html.includes('{{'), e.name);
  });
});

test('the close controls of the open project are links to Home', () => {
  [current(renderEntry(byName('Zoya'))), current(HOME)].forEach((html) => {
    assert.equal(count(html, 'currentProject__closeBtn'), 2);
    assert.equal(count(html, 'currentProject__closeBtn" href="/">'), 2);
  });
  // The bottom close is an <a> on a green bar; the theme `a` colour is green too.
  assert.match(HOME, /\.currentProject__close a\.currentProject__closeBtn \{\s*color: inherit;/);
});

test('Home opens no overlay: plain grid links and no project script', () => {
  const html = HOME;
  ['#proj=\' +', 'ajaxProject', 'project__openned', 'centerMini', 'PLoppened', 'zeroOpac',
    'aria-current', 'get_post_by_field_project'].forEach((s) => {
    assert.ok(!html.includes(s), s);
  });
  assert.ok(!/project__link[^\n]*\)\s*event\.preventDefault/.test(html));
  assert.ok(html.includes('<div class="centerProject">'));
  assert.ok(html.includes('<div class="currentProject">'));
});

test('burger.js no longer clicks the project close button', () => {
  const file = path.join(ROOT, 'wp-content/themes/nellis/assets/JS/burger.js');
  const js = fs.readFileSync(file, 'utf8');
  assert.ok(!js.includes('currentProject__closeBtn'));
});

test('a sidebar category filters the grid in place on Home and on project pages', () => {
  const html = fs.readFileSync(path.join(ROOT, 'build/lib/partials/index-projects.html'), 'utf8');
  assert.ok(!html.includes('location.assign('), 'a category click must not leave the page');
  const script = html.slice(html.lastIndexOf('const categoryLink'), html.lastIndexOf('</script>'));
  assert.ok(!script.includes('history.pushState'), 'a filter must not change the URL');
  assert.ok(!script.includes('location.hash'), 'the filter state is not in the URL');
  ['getItem(', 'setItem(', 'removeItem('].forEach((s) => {
    assert.ok(script.includes(`sessionStorage.${s}FILTER_KEY`), s);
  });
  assert.ok(script.includes("const FILTER_KEY = 'nellisProjectFilter';"));
  const times = (s) => html.split(s).length - 1;
  const swaps = times("querySelector('.center .container').innerHTML = xhr.responseText");
  const scrolls = times('            showCurrent();');
  assert.equal(scrolls, swaps, 'each filter shows the open project');
});
