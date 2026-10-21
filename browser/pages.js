const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  DESKTOP, MOBILE, visit, check,
} = require('./lib/page');
const {
  CATEGORY_KEYS, inCategory, loadProjects,
} = require('../build/lib/projects');

const LIST = loadProjects(path.join(__dirname, '..'));

const MENU = {
  Projects: '/projects/',
  News: '/news/',
  Contact: '/contact/',
  Studio: '/studio/',
  People: '/people/',
};

const SWEEP = ['/', '/projects/', ...CATEGORY_KEYS.map((cat) => `/projects/${cat}/`),
  '/projects/architecture/zoya/', '/news/', '/news/ai-in-home-design-useful-or-hype/',
  '/contact/', '/studio/', '/people/', '/privacy/'];

const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

VIEWPORTS.forEach(([label, viewport]) => {
  test(`pages: /projects/ hub grid (${label})`, async () => {
    const v = await visit('/projects/', viewport);
    await check(v, `pages-hub-${label}`, async () => {
      const count = await v.page.evaluate(() => document
        .querySelectorAll('.center .container .project__item').length);
      assert.equal(count, LIST.length);
    });
  });

  CATEGORY_KEYS.forEach((cat) => {
    test(`pages: /projects/${cat}/ grid (${label})`, async () => {
      const v = await visit(`/projects/${cat}/`, viewport);
      await check(v, `pages-${cat}-${label}`, async () => {
        const expected = LIST.filter((entry) => inCategory(entry, cat)).length;
        const count = await v.page.evaluate(() => document
          .querySelectorAll('.center .container .project__item').length);
        assert.equal(count, expected);
      });
    });
  });

  ['/', '/contact/'].forEach((where) => {
    test(`pages: the menu links on ${where} (${label})`, async () => {
      const v = await visit(where, viewport);
      await check(v, `pages-menu-${label}`, async () => {
        const links = await v.page.evaluate((items) => {
          const found = {};
          document.querySelectorAll('a').forEach((a) => {
            const text = a.textContent.trim();
            if (items[text] && !found[text]) found[text] = a.getAttribute('href');
          });
          return found;
        }, MENU);
        assert.deepEqual(links, MENU);
      });
    });
  });
});

test('pages: the menu navigates', async () => {
  const v = await visit('/', DESKTOP);
  await check(v, 'pages-menu-nav', async () => {
    /* ul.nav__items overlays the link's click point: dispatch the click. */
    await v.page.locator('header a.projectPage').first().dispatchEvent('click');
    await v.page.waitForURL('**/projects/');
    assert.equal(new URL(v.page.url()).pathname, '/projects/');
  });
});

SWEEP.forEach((where) => {
  VIEWPORTS.forEach(([label, viewport]) => {
    test(`pages: clean visit ${where} (${label})`, async () => {
      const v = await visit(where, viewport);
      await check(v, `pages-sweep${where.replace(/\//g, '-')}-${label}`, async () => {
        /* the footer slides in on scroll: attached is enough */
        await v.page.waitForSelector('footer', { state: 'attached' });
      });
    });
  });
});
