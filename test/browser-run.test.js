const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CHROMIUM, USAGE, pickBrowser, exitCode,
} = require('../browser/run');

const there = () => true;
const missing = () => false;

test('exitCode: a child that a signal killed answers 1, not 0', () => {
  assert.equal(exitCode(null), 1);
  assert.equal(exitCode(undefined), 1);
});

test('exitCode: a real code passes through, also 0', () => {
  assert.equal(exitCode(0), 0);
  assert.equal(exitCode(1), 1);
  assert.equal(exitCode(2), 2);
});

test('pickBrowser: an unknown keyword names the valid values', () => {
  assert.throws(() => pickBrowser({ BROWSER: 'netscape' }, there), /Unknown BROWSER: netscape\./);
  assert.throws(() => pickBrowser({ BROWSER: 'netscape' }, there), (error) => {
    assert.equal(error.message, `Unknown BROWSER: netscape. ${USAGE}`);
    return true;
  });
});

test('pickBrowser: an inherited Object member is an unknown keyword', () => {
  ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'].forEach((keyword) => {
    assert.throws(
      () => pickBrowser({ BROWSER: keyword }, there),
      new RegExp(`Unknown BROWSER: ${keyword}\\. BROWSER takes`),
      keyword,
    );
  });
});

test('pickBrowser: a keyword maps to its binary, and the value is trimmed', () => {
  assert.equal(pickBrowser({ BROWSER: 'brave' }, there).options.executablePath, CHROMIUM.brave);
  assert.equal(pickBrowser({ BROWSER: 'chrome' }, there).options.executablePath, CHROMIUM.chrome);
  assert.equal(pickBrowser({ BROWSER: ' BRAVE ' }, there).options.executablePath, CHROMIUM.brave);
  assert.equal(pickBrowser({ BROWSER: 'brave' }, there).type, 'chromium');
});

test('pickBrowser: an absolute path is the binary', () => {
  const bin = '/opt/browsers/any-chromium';
  assert.equal(pickBrowser({ BROWSER: bin }, there).options.executablePath, bin);
});

test('pickBrowser: an absolute path that does not exist says where', () => {
  assert.throws(
    () => pickBrowser({ BROWSER: '/no/such/browser' }),
    /No browser at \/no\/such\/browser\. BROWSER takes/,
  );
});

test('pickBrowser: unset takes the first installed Chromium browser', () => {
  assert.equal(pickBrowser({}, there).options.executablePath, CHROMIUM.brave);
  const onlyChrome = (bin) => bin === CHROMIUM.chrome;
  assert.equal(pickBrowser({}, onlyChrome).options.executablePath, CHROMIUM.chrome);
});

test('pickBrowser: no installed Chromium browser says so', () => {
  assert.throws(() => pickBrowser({}, missing), /No Chromium browser found\. BROWSER takes/);
});

test('pickBrowser: safari and webkit use the WebKit engine, with no binary path', () => {
  ['safari', 'webkit', 'SAFARI', ' WebKit '].forEach((value) => {
    const picked = pickBrowser({ BROWSER: value }, there);
    assert.equal(picked.type, 'webkit', value);
    assert.deepEqual(picked.options, { headless: true }, value);
  });
});

test('pickBrowser: safari without the WebKit build names the install command', () => {
  const pick = () => pickBrowser({ BROWSER: 'safari' }, missing);
  assert.throws(pick, /WebKit build is not installed/);
  assert.throws(pick, /npx playwright-core install webkit/);
});

test('pickBrowser: HEADED=1 launches visibly, any other value stays headless', () => {
  assert.equal(pickBrowser({ BROWSER: 'brave', HEADED: '1' }, there).options.headless, false);
  assert.equal(pickBrowser({ BROWSER: 'safari', HEADED: '1' }, there).options.headless, false);
  assert.equal(pickBrowser({ BROWSER: 'brave', HEADED: '0' }, there).options.headless, true);
  assert.equal(pickBrowser({ BROWSER: 'brave', HEADED: 'true' }, there).options.headless, true);
  assert.equal(pickBrowser({ BROWSER: 'brave' }, there).options.headless, true);
});
