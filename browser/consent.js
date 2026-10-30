const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DESKTOP, MOBILE, visit, check,
} = require('./lib/page');

const BERLIN = { timezoneId: 'Europe/Berlin' };
const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

/* The consent calls in the GA dataLayer, as plain arrays. */
const consentCalls = (v) => v.page.evaluate(() => window.dataLayer
  .map((args) => Array.from(args))
  .filter((args) => args[0] === 'consent')
  .map(([, kind, value]) => [kind, value.analytics_storage]));

const bannerShown = (v) => v.page.evaluate(() => {
  const banner = document.querySelector('.consentBanner');
  return Boolean(banner && !banner.hidden);
});

VIEWPORTS.forEach(([label, viewport]) => {
  test(`consent: a European timezone shows the banner; Decline is stored (${label})`, async () => {
    const v = await visit('/studio/', viewport, BERLIN);
    await check(v, `consent-decline-${label}`, async () => {
      await v.page.waitForSelector('.consentBanner');
      const box = await v.page.locator('.consentBanner').boundingBox();
      assert.ok(box.height <= 80, `banner height ${box.height}`);
      await v.page.click('.consentBanner [data-consent="denied"]');
      assert.equal(await bannerShown(v), false);
      assert.deepEqual(await consentCalls(v), [['default', 'denied'], ['update', 'denied']]);
      await v.page.reload();
      await v.page.waitForLoadState('load');
      assert.equal(await bannerShown(v), false, 'no banner after a stored choice');
      assert.deepEqual(await consentCalls(v), [['default', 'denied'], ['update', 'denied']]);
    });
  });
});

test('consent: Cookie settings opens the banner again; Accept grants analytics', async () => {
  const v = await visit('/studio/', DESKTOP, BERLIN);
  await check(v, 'consent-settings', async () => {
    await v.page.click('.consentBanner [data-consent="denied"]');
    await v.page.evaluate(() => document.querySelector('.footer .cookieSettings').click());
    assert.equal(await bannerShown(v), true);
    await v.page.click('.consentBanner [data-consent="granted"]');
    assert.equal(await v.page.evaluate(() => localStorage.getItem('nellis-consent')), 'granted');
    assert.deepEqual((await consentCalls(v)).at(-1), ['update', 'granted']);
  });
});

test('consent: a Dubai timezone shows no banner and adds no consent update', async () => {
  const v = await visit('/', DESKTOP);
  await check(v, 'consent-dubai', async () => {
    await v.page.waitForLoadState('load');
    assert.equal(await bannerShown(v), false);
    assert.deepEqual(await consentCalls(v), [['default', 'denied']]);
  });
});
