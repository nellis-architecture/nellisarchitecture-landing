const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DESKTOP, MOBILE, visit, check,
} = require('./lib/page');
const {
  CATEGORY_KEYS, inCategory, loadProjects,
} = require('../build/lib/projects');
const service = require('../build/lib/pages/service');
const { readSite } = require('../build/lib/pages');
const { readManifest } = require('../build/lib/images');
const { markdownPage } = require('../build/lib/markdown');
const { MARK } = require('../build/lib/landing');

const ROOT = path.join(__dirname, '..');
const LIST = loadProjects(ROOT);
const FIXTURE = path.join(ROOT, 'landing-sweep');
const FIXTURE_BODY = `Intro with **bold**, *italic* and [a link](/contact/).

## Second level

### Third level

#### Fourth level

- One item
- Two items

> A quote.

---

![Sweep](/wp-content/uploads/2024/01/Untitled-design-1.jpg)`;

/* No landing page is in the repo: the sweep renders one. A crashed run leaves the folder, and
   test/assets-deny.test.js then fails. */
before(() => {
  const content = {
    ...markdownPage({ h1: 'Landing sweep', noindex: 'true' }, FIXTURE_BODY),
    title: 'Landing sweep',
  };
  const html = service.render(content, {
    site: readSite(ROOT),
    page: { slug: 'landing-sweep', before: MARK },
    manifest: readManifest(ROOT),
  });
  fs.mkdirSync(FIXTURE, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE, 'index.html'), html);
});

after(() => fs.rmSync(FIXTURE, { recursive: true, force: true }));

const MENU = {
  Projects: '/projects/',
  News: '/news/',
  Contact: '/contact/',
  Studio: '/studio/',
  People: '/people/',
};

const SWEEP = ['/', '/projects/', ...CATEGORY_KEYS.map((cat) => `/projects/${cat}/`),
  '/projects/architecture/zoya/', '/news/', '/news/category/interior-design/',
  '/news/ai-in-home-design-useful-or-hype/',
  '/contact/', '/studio/', '/studio/architecture-design/', '/studio/landscape-architecture/',
  '/people/', '/privacy/', '/landing-sweep/'];

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

const HOOKS = [['/news/', 'newsPage'], ['/contact/', 'contactPage']];

HOOKS.forEach(([where, hook]) => {
  [['desktop', DESKTOP], ['375', { width: 375, height: 812 }]].forEach(([label, viewport]) => {
    test(`pages: the nav marks the current item on ${where} (${label})`, async () => {
      const v = await visit(where, viewport);
      await check(v, `pages-nav-mark-${hook}-${label}`, async () => {
        const nav = await v.page.evaluate((cls) => {
          const items = [...document.querySelectorAll('header .nav__items .nav-item')];
          const style = (el) => getComputedStyle(el);
          const a = document.querySelector(`header .nav__items a.${cls}`);
          return {
            nested: document.querySelectorAll('header .nav__items a > li').length,
            mark: [style(a).display, style(a).listStyleType, style(a).marginLeft, style(a).color],
            sizes: [...document.querySelectorAll('header .nav__items .nav-item a')]
              .map((x) => style(x).fontSize === style(x.parentElement).fontSize),
            others: [...document.querySelectorAll('header .nav__items .nav-item a')]
              .filter((x) => x !== a)
              .map((x) => [x, x.parentElement].some((el) => style(el).display === 'list-item')),
            order: items.map((li, i) => [Number(style(li).order), i, li.textContent.trim()])
              .sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[2]),
          };
        }, hook);
        assert.equal(nav.nested, 0);
        assert.deepEqual(nav.mark, ['list-item', 'disc', '16px', 'rgb(0, 46, 32)']);
        /* The label keeps the size of the li, as before the link moved inside it. */
        assert.ok(nav.sizes.length > 0 && nav.sizes.every(Boolean), String(nav.sizes));
        assert.ok(nav.others.length > 0 && nav.others.every((m) => !m), String(nav.others));
        assert.deepEqual(nav.order, readSite(ROOT).nav.map((it) => it.label));
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
