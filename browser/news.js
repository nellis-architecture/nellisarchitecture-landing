const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DESKTOP, MOBILE, visit, check,
} = require('./lib/page');

const ROOT = path.join(__dirname, '..');
const NEWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'news.json'), 'utf8'));
const POST = '/news/ai-in-home-design-useful-or-hype/';

const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

VIEWPORTS.forEach(([label, viewport]) => {
  test(`news: the index lists every post (${label})`, async () => {
    const v = await visit('/news/', viewport);
    await check(v, `news-index-${label}`, async () => {
      const count = await v.page.evaluate(() => document
        .querySelectorAll('.newsIndexItem').length);
      assert.equal(count, Object.keys(NEWS).length);
    });
  });

  test(`news: the sidebar lists every post with id and slug (${label})`, async () => {
    const v = await visit(POST, viewport);
    await check(v, `news-sidebar-${label}`, async () => {
      const count = await v.page.evaluate(() => document
        .querySelectorAll('.NewsListItem[data-id][data-slug]').length);
      assert.equal(count, Object.keys(NEWS).length);
    });
  });

  test(`news: a sidebar click marks Active and swaps the article (${label})`, async () => {
    const v = await visit(POST, viewport);
    await check(v, `news-switch-${label}`, async () => {
      await v.page.waitForFunction(
        () => document.querySelector('.NewsTitle').textContent.trim() !== '',
      );
      const target = await v.page.evaluate(() => {
        const item = [...document.querySelectorAll('.NewsListItem')]
          .find((el) => !el.classList.contains('Active'));
        return { id: item.getAttribute('data-id'), slug: item.getAttribute('data-slug') };
      });
      await v.page.locator(`.NewsListItem[data-id="${target.id}"]`).first().click();
      await v.page.waitForFunction(
        ({ id, title }) => document.querySelector(`.NewsListItem[data-id="${id}"]`)
          .classList.contains('Active')
          && document.querySelector('.NewsTitle').textContent.trim() === title,
        { id: target.id, title: NEWS[target.id].data.title.trim() },
      );
      assert.equal(new URL(v.page.url()).pathname, `/news/${target.slug}/index.html`);
    });
  });

  test(`news: the switcher moves between posts and back (${label})`, async () => {
    const v = await visit(POST, viewport);
    await check(v, `news-pager-${label}`, async () => {
      await v.page.waitForFunction(
        () => document.querySelector('.NewsTitle').textContent.trim() !== '',
      );
      const items = await v.page.evaluate(() => [...document.querySelectorAll('.NewsListItem')]
        .slice(0, 2)
        .map((el) => ({ id: el.getAttribute('data-id'), slug: el.getAttribute('data-slug') })));
      const [first, second] = items;
      await v.page.locator(`.NewsListItem[data-id="${first.id}"]`).first().click();
      await v.page.waitForFunction(
        (title) => document.querySelector('.NewsTitle').textContent.trim() === title,
        NEWS[first.id].data.title.trim(),
      );
      await v.page.locator(`.NewsListItem[data-id="${second.id}"]`).first().click();
      await v.page.waitForFunction(
        (title) => document.querySelector('.NewsTitle').textContent.trim() === title,
        NEWS[second.id].data.title.trim(),
      );
      await v.page.goBack({ waitUntil: 'domcontentloaded' });
      await v.page.waitForFunction(
        ({ id, title }) => document.querySelector(`.NewsListItem[data-id="${id}"]`)
          .classList.contains('Active')
          && document.querySelector('.NewsTitle').textContent.trim() === title,
        { id: first.id, title: NEWS[first.id].data.title.trim() },
      );
    });
  });
});
