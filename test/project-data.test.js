const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProjects, earlyScript } = require('../build/lib/projects');
const { grid, filterFiles, searchJson } = require('../build/lib/pages/grid');
const project = require('../build/lib/pages/project');
const category = require('../build/lib/pages/category');
// eslint-disable-next-line import-x/no-useless-path-segments -- Home page module
const index = require('../build/lib/pages/index');
const { PAGES, readContent } = require('../build/lib/pages');
const { sitemap, writeProjectData, writeRedirects } = require('../build-news');

const ROOT = path.join(__dirname, '..');
const LIST = loadProjects(ROOT);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pages', 'site.json'), 'utf8'));
const count = (s, sub) => s.split(sub).length - 1;

const proj = (over = {}) => ({
  name: 'Fixture <b>',
  slug: 'fixture',
  category: 'landscape',
  also_in: ['interior-design'],
  type: 'commercial',
  order: 335,
  area: 'Area',
  region: 'Region',
  facts: [{ label: 'Type:', value: 'Villa' }],
  hero: '/wp-content/uploads/fixture/hero.jpg',
  card_image: '/wp-content/uploads/fixture/card.jpg',
  list_image: '/wp-content/uploads/fixture/list.jpg',
  ...over,
});

/* files: file name -> project. Returns what loadProjects() gives on a temp root. */
function load(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'));
  try {
    fs.mkdirSync(path.join(dir, 'content', 'projects'), { recursive: true });
    Object.entries(files).forEach(([name, p]) => {
      const text = typeof p === 'string' ? p : JSON.stringify(p);
      fs.writeFileSync(path.join(dir, 'content', 'projects', name), text);
    });
    return loadProjects(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('loadProjects sorts by order, then by name, and keeps the file name', () => {
  const list = load({
    'c.json': proj({ name: 'C', slug: 'c', order: 20 }),
    'b.json': proj({ name: 'B', slug: 'b', order: 10 }),
    'a.json': proj({ name: 'A', slug: 'a', order: 20 }),
    'note.txt': {},
  });
  assert.deepEqual(list.map((e) => e.name), ['B', 'A', 'C']);
  assert.deepEqual(list[0], {
    name: 'B',
    p: proj({ name: 'B', slug: 'b', order: 10 }),
    slug: 'b',
    cat: 'landscape',
    url: '/projects/landscape/b/',
    filename: 'b',
  });
});

const fails = (over, re) => assert.throws(() => load({ 'x.json': proj(over) }), (err) => {
  assert.match(err.message, /^content\/projects\/x\.json: /);
  assert.match(err.message, re);
  return true;
});

test('loadProjects names the file in each validation error', () => {
  ['name', 'slug', 'category', 'type', 'hero', 'card_image'].forEach((key) => {
    fails({ [key]: undefined }, new RegExp(`${key} is required`));
    fails({ [key]: ' ' }, new RegExp(`${key} is required`));
  });
  fails({ order: undefined }, /order must be a number/);
  fails({ order: '10' }, /order must be a number/);
  fails({ slug: 'Bad Slug' }, /slug must be lowercase/);
  fails({ category: 'gardens' }, /unknown category "gardens"/);
  fails({ type: 'mixed' }, /unknown type "mixed"/);
  fails({ also_in: ['gardens'] }, /unknown also_in category "gardens"/);
});

test('loadProjects refuses a field of the wrong shape', () => {
  ['also_in', 'facts', 'text_1', 'text_2', 'text_3', 'slider_1', 'image_2', 'slider_2',
    'last_images'].forEach((key) => {
    fails({ [key]: 'text' }, new RegExp(`${key} must be a list`));
    fails({ [key]: { a: 1 } }, new RegExp(`${key} must be a list`));
  });
  ['text_1', 'text_2', 'text_3'].forEach((key) => {
    fails({ [key]: ['ok', 3] }, new RegExp(`${key} items must be text`));
    fails({ [key]: [null] }, new RegExp(`${key} items must be text`));
  });
  ['slider_1', 'image_2', 'slider_2', 'last_images'].forEach((key) => {
    fails({ [key]: [{ alt: 'no src' }] }, new RegExp(`${key} items need src`));
    fails({ [key]: ['/wp-content/uploads/a.jpg'] }, new RegExp(`${key} items need src`));
    fails({ [key]: [null] }, new RegExp(`${key} items need src`));
    fails({ [key]: [{ src: '/uploads/a.jpg' }] }, new RegExp(`${key} src must start`));
  });
  fails({ facts: [{ label: 'Type:' }] }, /facts items need label and value/);
  fails({ facts: [{ value: 'Villa' }] }, /facts items need label and value/);
  fails({ facts: ['Type:'] }, /facts items need label and value/);
  fails({ seo: { noindex: 'true' } }, /seo\.noindex must be true or false: "true"/);
  fails({ seo: { noindex: 1 } }, /seo\.noindex must be true or false: "1"/);
});

test('loadProjects refuses an image outside the uploads and a hero of another type', () => {
  ['hero', 'card_image', 'list_image'].forEach((key) => {
    fails({ [key]: 'https://x.com/a.jpg' }, new RegExp(`${key} must start`));
    fails({ [key]: 'wp-content/uploads/a.jpg' }, new RegExp(`${key} must start`));
  });
  fails({ list_image: 5 }, /list_image must start/);
  fails({ hero: '/wp-content/uploads/a.pdf' }, /hero must be an image or an mp4/);
  fails({ hero: '/wp-content/uploads/a.webm' }, /hero must be an image or an mp4/);
  fails({ hero: '/wp-content/uploads/a' }, /hero must be an image or an mp4/);
  ['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.mp4'].forEach((name) => {
    assert.equal(load({ 'x.json': proj({ hero: `/wp-content/uploads/${name}` }) }).length, 1);
  });
});

test('loadProjects accepts an empty value in each optional field', () => {
  const over = { list_image: '', seo: {} };
  ['also_in', 'facts', 'text_1', 'slider_1', 'last_images'].forEach((key) => {
    [[], null, ''].forEach((value) => {
      assert.equal(load({ 'x.json': proj({ ...over, [key]: value }) }).length, 1, key);
    });
  });
});

test('loadProjects names the file of bad JSON', () => {
  const named = (re) => (err) => re.test(err.message);
  assert.throws(
    () => load({ 'x.json': '{ "name": ' }),
    named(/^content\/projects\/x\.json: not valid JSON/),
  );
  assert.throws(
    () => load({ 'x.json': 'null' }),
    named(/^content\/projects\/x\.json: must be a JSON object/),
  );
});

test('a project with only the required fields gives no "undefined"', () => {
  const [e] = load({
    'minimal.json': {
      name: 'Minimal',
      slug: 'minimal',
      category: 'landscape',
      type: 'residential',
      order: 1,
      hero: '/wp-content/uploads/minimal/hero.jpg',
      card_image: '/wp-content/uploads/minimal/card.jpg',
    },
  });
  const page = project.render(e, {
    site, newsHref: '/news/', projects: [e], manifest: {},
  });
  const start = page.indexOf('<div class="currentProject-heroImg');
  assert.ok(start > 0);
  [
    page.slice(0, page.indexOf('<script')),
    page.slice(start),
    grid([e]),
    ...Object.values(filterFiles([e], {})),
    searchJson([e], {}),
  ].forEach((html) => assert.ok(!html.includes('undefined'), html.slice(0, 200)));
});

test('loadProjects refuses a duplicate URL and a duplicate name', () => {
  assert.throws(
    () => load({ 'a.json': proj({ name: 'A' }), 'b.json': proj({ name: 'B' }) }),
    /b\.json: duplicate URL \/projects\/landscape\/fixture\//,
  );
  assert.throws(
    () => load({ 'a.json': proj({ slug: 'a' }), 'b.json': proj({ slug: 'b' }) }),
    /b\.json: duplicate name "Fixture <b>"/,
  );
  assert.equal(load({
    'a.json': proj({ name: 'A' }), 'b.json': proj({ name: 'B', category: 'architecture' }),
  }).length, 2);
});

test('a new project reaches every generated list', () => {
  const [fixture] = load({ 'fixture.json': proj() });
  const list = [...LIST, fixture];
  const page = project.render(fixture, {
    site, newsHref: '/news/', projects: list, manifest: {},
  });
  assert.ok(page.includes('font-weight: 200;">Fixture &lt;b&gt;</h2>'));
  assert.equal(count(page, `(Projects ${list.length})`), 2);
  const ctx = {
    site, page: PAGES[0], projects: list, manifest: {},
  };
  const home = index.render(readContent(ROOT, 'index'), ctx);
  assert.equal(count(home, `(Projects ${list.length})`), 2);
  assert.ok(home.includes(`href="${fixture.url}" aria-label="Fixture &lt;b&gt;"`));
  assert.ok(earlyScript(list).includes('"Fixture <b>"'.replace('<', '\\u003c')));
  ['projects', 'projects-landscape', 'projects-interior-design'].forEach((content) => {
    const html = category.render(readContent(ROOT, content), {
      site, page: PAGES.find((p) => p.content === content), root: ROOT, projects: list,
    });
    assert.ok(html.includes(`href="${fixture.url}"`), content);
  });
  const filters = filterFiles(list, {});
  ['landscape_0', 'interior_design_0'].forEach((name) => {
    assert.ok(filters[name].includes(`href="${fixture.url}"`), name);
  });
  const search = JSON.parse(searchJson(list, {})).find((s) => s.title === fixture.name);
  assert.deepEqual(search, {
    title: 'Fixture <b>',
    project_type_set: ['Type:', 'Villa'],
    minImg: '/wp-content/uploads/fixture/list.jpg',
  });
  assert.ok(sitemap([], [], list).includes('/projects/landscape/fixture/</loc>'));
});

test('filter membership follows the category, Also in and Type', () => {
  const list = load({
    'a.json': proj({
      name: 'A', slug: 'a', category: 'architecture', also_in: ['landscape'], type: 'residential',
    }),
    'b.json': proj({
      name: 'B', slug: 'b', category: 'landscape', also_in: [], type: 'commercial',
    }),
  });
  const files = filterFiles(list, {});
  const names = (key) => [...files[key].matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names('architecture_1'), ['A']);
  assert.deepEqual(names('landscape_1'), ['A']);
  assert.deepEqual(names('landscape_0'), ['B']);
  assert.deepEqual(names('architecture_0'), []);
  assert.deepEqual(names('master_planning_1'), []);
  assert.deepEqual(Object.keys(files).sort(), [
    'all_1', 'architecture_0', 'architecture_1', 'empty_1', 'interior_design_0',
    'interior_design_1', 'landscape_0', 'landscape_1', 'master_planning_0', 'master_planning_1',
  ]);
  assert.ok(files.interior_design_0.endsWith('<span>interior design / commercial </span> </div>'));
  assert.ok(files.empty_1.endsWith('<span> / residential </span> </div>'));
});

test('grid: the current item opens, the others hide; no current hides nothing', () => {
  const list = load({
    'a.json': proj({ name: 'A', slug: 'a', order: 1 }),
    'b.json': proj({
      name: 'B', slug: 'b', order: 2, area: '',
    }),
  });
  const plain = grid(list);
  assert.ok(!plain.includes('zeroOpac') && !plain.includes('aria-current'));
  assert.ok(plain.includes(`              ${''} <br>\n              Region            </span>`));
  const html = grid(list, { current: list[0].url, slot: 'thumb' });
  assert.equal(count(html, 'aria-current="page"'), 1);
  assert.ok(html.includes('href="/projects/landscape/a/" aria-current="page" aria-label="A"'));
  assert.equal(count(html, '<div class="project__item zeroOpac">'), 1);
  assert.equal(count(html, '<div class="project__item">'), 1);
  assert.equal(count(html, 'class="projectPL PLoppened"'), 1);
});

test('the alt fields replace the project name', () => {
  const [plain] = load({ 'a.json': proj({ name: 'A' }) });
  assert.ok(grid([plain]).includes('alt="A"'));
  const [alt] = load({
    'a.json': proj({
      name: 'A',
      card_alt: 'Card alt',
      hero_alt: 'Hero alt',
      slider_1: [{ src: '/wp-content/uploads/s.jpg', alt: 'Slide alt' }, {
        src: '/wp-content/uploads/t.jpg',
      }],
      image_2: [{ src: '/wp-content/uploads/i.jpg', alt: 'Image alt' }],
    }),
  });
  assert.ok(grid([alt]).includes('alt="Card alt"'));
  assert.ok(filterFiles([alt], {}).landscape_0.includes('alt="Card alt"'));
  const html = project.render(alt, {
    site, newsHref: '/news/', projects: [alt], manifest: {},
  });
  ['Hero alt', 'Slide alt', 'Image alt'].forEach((s) => assert.ok(html.includes(`alt="${s}"`), s));
  assert.ok(html.includes('src="/wp-content/uploads/t.jpg"'));
});

test('a filter item and search use list_image, else card_image; the grid uses card_image', () => {
  const [scaled] = load({ 'a.json': proj() });
  assert.ok(filterFiles([scaled], {}).landscape_0.includes('list.jpg'));
  assert.ok(grid([scaled]).includes('card.jpg'));
  const [one] = load({ 'a.json': proj({ list_image: undefined }) });
  assert.ok(filterFiles([one], {}).landscape_0.includes('card.jpg'));
  assert.equal(JSON.parse(searchJson([one], {}))[0].minImg, '/wp-content/uploads/fixture/card.jpg');
});

test('writeProjectData writes the filter files and data/search.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lists-'));
  try {
    fs.mkdirSync(path.join(dir, 'data', 'filters'), { recursive: true });
    const list = load({ 'a.json': proj() });
    writeProjectData(dir, list, {});
    assert.equal(fs.readdirSync(path.join(dir, 'data', 'filters')).length, 10);
    const file = path.join(dir, 'data', 'filters', 'landscape_0.html');
    assert.ok(fs.readFileSync(file, 'utf8').includes('aria-label="Fixture &lt;b&gt;"'));
    const search = fs.readFileSync(path.join(dir, 'data', 'search.json'), 'utf8');
    assert.equal(search, searchJson(list, {}));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const pageOf = (p) => {
  const [e] = load({ 'fixture.json': p });
  return project.render(e, {
    site, newsHref: '/news/', projects: [e], manifest: {},
  });
};
const DOMAIN = 'https://nellisarchitecture.com';

test('an empty SEO object keeps the generated title and description', () => {
  const text = { text_1: ['First text.'] };
  const html = pageOf(proj(text));
  assert.equal(pageOf(proj({ ...text, seo: {} })), html);
  assert.equal(pageOf(proj({
    ...text,
    seo: {
      title: '', og_title: '', description: '', canonical: '', noindex: false, schema: '',
    },
  })), html);
  assert.ok(html.includes('<title>Fixture &lt;b&gt; | Area | Nellis Architecture</title>'));
  assert.ok(html.includes('<meta name="description" content="First text." />'));
  assert.ok(html.includes("<meta name='robots' content='index, follow"));
  const url = `${DOMAIN}/projects/landscape/fixture/`;
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
});

test('each SEO field overrides its generated value', () => {
  const html = (seo) => pageOf(proj({ seo }));
  assert.ok(html({ title: 'T <x>' }).includes('<title>T &lt;x&gt;</title>'));
  assert.ok(html({ title: 'T' }).includes('<meta property="og:title" content="T" />'));
  assert.ok(html({ og_title: 'O' }).includes('<meta property="og:title" content="O" />'));
  const desc = html({ description: 'D' });
  assert.ok(desc.includes('<meta name="description" content="D" />'));
  assert.ok(desc.includes('<meta property="og:description" content="D" />'));
  const canonical = `${DOMAIN}/studio/`;
  assert.ok(html({ canonical }).includes(`<link rel="canonical" href="${canonical}" />`));
  assert.throws(
    () => html({ canonical: 'https://x.com/' }),
    (err) => err.message.startsWith('content/projects/fixture.json: seo.canonical must start'),
  );
  const custom = html({ schema: '{"@type":"Thing"}' });
  assert.ok(custom.includes('<script type="application/ld+json">{"@type":"Thing"}</script>'));
  assert.throws(() => html({ schema: '{' }), /fixture.json: schema is not valid/);
  assert.ok(html({ noindex: true }).includes('<meta name="robots" content="noindex">'));
});

test('og:image of a video hero: the first slide, else the card image', () => {
  const video = { hero: '/wp-content/uploads/fixture/hero.mp4' };
  const og = (src) => `<meta property="og:image" content="${DOMAIN}${src}">`;
  const slide = { src: '/wp-content/uploads/fixture/slide.jpg' };
  assert.ok(pageOf(proj({ ...video, slider_1: [slide] })).includes(og(slide.src)));
  assert.ok(pageOf(proj(video)).includes(og('/wp-content/uploads/fixture/card.jpg')));
  assert.ok(pageOf(proj()).includes(og('/wp-content/uploads/fixture/hero.jpg')));
});

test('a noindex project leaves the sitemap and stays in the grid', () => {
  const list = load({
    'a.json': proj({ name: 'A', slug: 'a', seo: { noindex: true } }),
    'b.json': proj({ name: 'B', slug: 'b' }),
  });
  const xml = sitemap([], [], list);
  assert.ok(!xml.includes('/projects/landscape/a/'));
  assert.ok(xml.includes('/projects/landscape/b/'));
  assert.ok(grid(list).includes('href="/projects/landscape/a/"'));
});

function redirectRoot(fixed = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-'));
  fs.mkdirSync(path.join(dir, 'content'));
  fs.mkdirSync(path.join(dir, 'build'));
  fs.mkdirSync(path.join(dir, 'projects', 'landscape', 'new'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'projects', 'landscape', 'new', 'index.html'), 'x');
  fs.writeFileSync(path.join(dir, 'content', 'redirects.json'), '{"redirects":[]}');
  fs.writeFileSync(path.join(dir, 'build', 'redirects.txt'), fixed);
  return dir;
}

test('a changed slug gives a 301 from the file name URL', () => {
  const dir = redirectRoot();
  try {
    const list = load({ 'old.json': proj({ slug: 'new' }) });
    writeRedirects(dir, [], [], list);
    assert.ok(fs.readFileSync(path.join(dir, '_redirects'), 'utf8')
      .includes('/projects/landscape/old/ /projects/landscape/new/ 301'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unchanged slug gives no 301; a URL under a fixed rule stops the build', () => {
  const dir = redirectRoot('/projects/landscape/* /projects/ 301\n');
  const list = load({ 'new.json': proj({ slug: 'new' }) });
  try {
    assert.throws(
      () => writeRedirects(dir, [], [], list),
      /content\/projects\/new\.json: \/projects\/landscape\/new\/ matches build\/redirects\.txt/,
    );
    fs.writeFileSync(path.join(dir, 'build', 'redirects.txt'), '');
    assert.deepEqual(writeRedirects(dir, [], [], list), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the CMS collection of the projects', () => {
  const config = fs.readFileSync(path.join(ROOT, 'admin', 'config.yml'), 'utf8');
  const start = config.indexOf('name: "project-pages"');
  const block = config.slice(start, config.indexOf('name: "redirects"'));
  [
    'folder: "content/projects"', 'format: "json"', 'extension: "json"', 'create: true',
    'delete: false', 'slug: "{{fields.slug}}"', 'identifier_field: name',
    '{ field: "order", default_sort: "asc" }',
    'media_folder: "/wp-content/uploads/projects"',
    'public_folder: "/wp-content/uploads/projects"',
    'name: "order", widget: "number", value_type: "int"',
    'name: "hero", widget: "file"',
    'A category change moves the URL. Add a 301 in Redirects.',
  ].forEach((line) => assert.ok(block.includes(line), line));
  const optional = ['also_in', 'area', 'region', 'text_1', 'text_2', 'text_3', 'hero_alt',
    'image_2', 'slider_2', 'last_images', 'card_alt', 'list_image', 'alt', 'title', 'og_title',
    'description', 'canonical', 'noindex', 'schema'];
  optional.forEach((name) => assert.match(
    block,
    new RegExp(`name: "${name}",.*required: false`),
    name,
  ));
  ['facts', 'slider_1', 'seo'].forEach((name) => assert.match(
    block,
    new RegExp(`name: "${name}"\\n[^-]*required: false`),
    name,
  ));
  assert.ok(config.includes('A changed news, landing or project slug gets its rule'));
});
