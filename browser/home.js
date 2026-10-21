const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DESKTOP, MOBILE, visit, check,
} = require('./lib/page');

const ROOT = path.join(__dirname, '..');
const PROJECTS = Object.keys(JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'projects.json'), 'utf8'),
)).length;

const GRID = '.center .container a.project__link';
const gridHrefs = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .map((a) => a.getAttribute('href')), GRID);

const filterHrefs = (file) => [
  ...fs.readFileSync(path.join(ROOT, 'data', 'filters', file), 'utf8')
    .matchAll(/href="(\/projects\/[^"]*)"/g),
].map((m) => m[1]);

/* Waits until the grid shows exactly these hrefs (the badge is hidden on mobile). */
const waitGrid = (page, hrefs) => page.waitForFunction(
  ({ sel, expected }) => [...document.querySelectorAll(sel)]
    .map((a) => a.getAttribute('href')).sort().join('|') === expected,
  { sel: GRID, expected: [...new Set(hrefs)].sort().join('|') },
);

const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

VIEWPORTS.forEach(([label, viewport]) => {
  test(`home: the grid shows every project (${label})`, async () => {
    const v = await visit('/', viewport);
    await check(v, `home-grid-${label}`, async () => {
      const count = await v.page.evaluate(() => document
        .querySelectorAll('.center .container .project__item').length);
      assert.equal(count, PROJECTS);
      const hrefs = await gridHrefs(v.page);
      assert.equal(new Set(hrefs).size, PROJECTS);
    });
  });

  test(`home: the sidebar filters the grid, without a hash (${label})`, async () => {
    const v = await visit('/', viewport);
    await check(v, `home-filter-${label}`, async () => {
      const before = await gridHrefs(v.page);
      await v.page.locator('.nav__project_item a:visible', { hasText: 'architecture' }).first()
        .click();
      await waitGrid(v.page, filterHrefs('architecture_1.html'));
      assert.notDeepEqual(new Set(await gridHrefs(v.page)), new Set(before));
      assert.ok(!v.page.url().includes('#'), `no hash in ${v.page.url()}`);
    });
  });

  test(`home: the residential/commercial sub-filter (${label})`, async () => {
    const v = await visit('/', viewport);
    await check(v, `home-subfilter-${label}`, async () => {
      await v.page.locator('.nav__project_item a:visible', { hasText: 'architecture' }).first()
        .click();
      await waitGrid(v.page, filterHrefs('architecture_1.html'));
      await v.page.locator('.podkat:visible .commercial').first().click();
      await waitGrid(v.page, filterHrefs('architecture_0.html'));
      await v.page.locator('.podkat:visible .residential').first().click();
      await waitGrid(v.page, filterHrefs('architecture_1.html'));
    });
  });

  test(`home: the All button restores the grid (${label})`, async () => {
    const v = await visit('/', viewport);
    await check(v, `home-all-${label}`, async () => {
      const before = await gridHrefs(v.page);
      await v.page.locator('.nav__project_item a:visible', { hasText: 'architecture' }).first()
        .click();
      await waitGrid(v.page, filterHrefs('architecture_1.html'));
      await v.page.locator('.allButton:visible').first().click();
      await waitGrid(v.page, before);
      const saved = await v.page.evaluate(
        () => window.sessionStorage.getItem('nellisProjectFilter'),
      );
      assert.equal(saved, null);
    });
  });
});

test('home: the filter memory survives a reload, not a new tab', async () => {
  const v = await visit('/', DESKTOP);
  await check(v, 'home-memory', async () => {
    await v.page.locator('.nav__project_item a:visible', { hasText: 'architecture' }).first()
      .click();
    await waitGrid(v.page, filterHrefs('architecture_1.html'));
    const saved = await v.page.evaluate(() => window.sessionStorage.getItem('nellisProjectFilter'));
    assert.deepEqual(JSON.parse(saved), { cat: 'architecture', sub: 1 });
    await v.page.reload({ waitUntil: 'domcontentloaded' });
    await waitGrid(v.page, filterHrefs('architecture_1.html'));
    const tab = await v.context.newPage();
    await tab.goto(`${v.page.url().split('#')[0]}`, { waitUntil: 'domcontentloaded' });
    const count = await tab.evaluate(() => document
      .querySelectorAll('.center .container .project__item').length);
    assert.equal(count, PROJECTS);
    const fresh = await tab.evaluate(() => window.sessionStorage.getItem('nellisProjectFilter'));
    assert.equal(fresh, null);
    await tab.close();
  });
});

test('home: /#proj=<Name> redirects to the project page', async () => {
  const v = await visit('/#proj=Zoya', DESKTOP);
  await check(v, 'home-hash-proj', async () => {
    await v.page.waitForURL('**/projects/architecture/zoya/');
    assert.equal(new URL(v.page.url()).pathname, '/projects/architecture/zoya/');
  });
});

test('home: /#<category> redirects to the category page', async () => {
  const v = await visit('/#architecture', DESKTOP);
  await check(v, 'home-hash-cat', async () => {
    await v.page.waitForURL('**/projects/architecture/');
    assert.equal(new URL(v.page.url()).pathname, '/projects/architecture/');
  });
});
