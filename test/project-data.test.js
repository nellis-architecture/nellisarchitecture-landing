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
const { sitemap, writeProjectData } = require('../build-news');

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
      fs.writeFileSync(path.join(dir, 'content', 'projects', name), JSON.stringify(p));
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

test('loadProjects names the file in each validation error', () => {
  const fails = (over, re) => assert.throws(() => load({ 'x.json': proj(over) }), (err) => {
    assert.match(err.message, /^content\/projects\/x\.json: /);
    assert.match(err.message, re);
    return true;
  });
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
