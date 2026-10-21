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
const ZOYA = '/projects/architecture/zoya/';

const projectName = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('.currentProject-name')]
    .find((n) => n.textContent.trim() && n.offsetParent !== null);
  return el ? el.textContent.trim() : '';
});

const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

VIEWPORTS.forEach(([label, viewport]) => {
  test(`project: a Home grid link opens the project page (${label})`, async () => {
    const v = await visit('/', viewport);
    await check(v, `project-open-${label}`, async () => {
      const href = await v.page.evaluate(() => document
        .querySelector('.center .container a.project__link').getAttribute('href'));
      await v.page.locator('.center .container a.project__link').first().click();
      await v.page.waitForURL(`**${href}`);
      assert.equal(new URL(v.page.url()).pathname, href);
    });
  });

  test(`project: the thumb column lists every project (${label})`, async () => {
    const v = await visit(ZOYA, viewport);
    await check(v, `project-thumbs-${label}`, async () => {
      const count = await v.page.evaluate(() => document
        .querySelectorAll('.center .container .project__item').length);
      assert.equal(count, PROJECTS);
    });
  });
});

/* On mobile the open project covers the thumb column and the sidebar
   (position: fixed, full screen), so only Close works there. */
test('project: on mobile the open project covers the page, Close returns Home', async () => {
  const v = await visit(ZOYA, MOBILE);
  await check(v, 'project-mobile-cover', async () => {
    assert.equal(await projectName(v.page), 'Zoya');
    const covered = await v.page.evaluate(() => {
      const panel = document.querySelector('.currentProject.project__openned');
      const rect = panel.getBoundingClientRect();
      return rect.width >= window.innerWidth - 1;
    });
    assert.ok(covered, 'the open project covers the screen');
    await v.page.locator('a.currentProject__closeBtn:visible').first().click();
    await v.page.waitForURL('**/');
    assert.equal(new URL(v.page.url()).pathname, '/');
  });
});

test('project: a thumb click swaps the open project (desktop)', async () => {
  const v = await visit(ZOYA, DESKTOP);
  await check(v, 'project-switch-desktop', async () => {
    await v.page.evaluate(() => {
      window.nellisSwitches = 0;
      document.addEventListener('nellis:projectswitch', () => {
        window.nellisSwitches += 1;
      });
    });
    const before = await projectName(v.page);
    const target = await v.page.evaluate((own) => {
      const link = [...document.querySelectorAll('.center .container a.project__link')]
        .find((a) => a.getAttribute('href') !== own);
      return link.getAttribute('href');
    }, ZOYA);
    await v.page.locator(`.center .container a.project__link[href="${target}"]`).first()
      .click();
    await v.page.waitForFunction(
      ([own, next]) => window.location.pathname === next
        && [...document.querySelectorAll('.currentProject-name')]
          .some((n) => n.textContent.trim() && n.textContent.trim() !== own),
      [before, target],
    );
    const after = await projectName(v.page);
    assert.notEqual(after, before);
    assert.equal(new URL(v.page.url()).pathname, target); // pushState, no reload
    assert.ok(await v.page.evaluate(() => window.nellisSwitches) >= 1);
    const marked = await v.page.evaluate((next) => {
      const link = document.querySelector(`.center .container a.project__link[href="${next}"]`);
      const item = link && link.closest('.project__item');
      return {
        aria: link && link.getAttribute('aria-current'),
        open: item && item.querySelector('.projectPL').className.includes('PLoppened'),
      };
    }, target);
    assert.equal(marked.aria, 'page');
    assert.ok(marked.open);
  });
});

test('project: a sidebar filter opens the first project of the list (desktop)', async () => {
  const v = await visit(ZOYA, DESKTOP);
  await check(v, 'project-filter-desktop', async () => {
    const landscapeFile = path.join(ROOT, 'data', 'filters', 'landscape_1.html');
    const landscape = fs.readFileSync(landscapeFile, 'utf8');
    const first = landscape.match(/href="(\/projects\/[^"]*)"/)[1];
    await v.page.locator('.nav__project_item a:visible', { hasText: 'landscape' }).first()
      .click();
    await v.page.waitForFunction((next) => window.location.pathname === next, first);
    assert.equal(new URL(v.page.url()).pathname, first);
    const hrefs = [...landscape.matchAll(/href="(\/projects\/[^"]*)"/g)].map((m) => m[1]);
    /* restore: a reload keeps the filtered column and the open project */
    await v.page.reload({ waitUntil: 'domcontentloaded' });
    await v.page.waitForFunction(
      ({ sel, expected }) => [...document.querySelectorAll(sel)]
        .map((a) => a.getAttribute('href')).sort().join('|') === expected,
      { sel: '.center .container a.project__link', expected: [...new Set(hrefs)].sort().join('|') },
    );
    assert.equal(new URL(v.page.url()).pathname, first);
  });
});

test('project: the open thumb is scrolled into view (desktop)', async () => {
  const v = await visit(ZOYA, DESKTOP);
  await check(v, 'project-inview', async () => {
    await v.page.waitForFunction((own) => {
      const link = document.querySelector(`.center .container a.project__link[href="${own}"]`);
      const column = document.querySelector('.centerProject');
      const rect = link.parentNode.getBoundingClientRect();
      const box = column.getBoundingClientRect();
      return rect.top < box.bottom && rect.bottom > box.top;
    }, ZOYA);
  });
});
