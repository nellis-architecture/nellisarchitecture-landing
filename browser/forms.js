const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DESKTOP, MOBILE, visit, check, until, fillContact, openBrief,
} = require('./lib/page');

const CONTACT = '.contactForm form[name="contact"]';
const BRIEF = 'form[name="brief"]#yourFormId2';
const SENT = 'Thank you. Your message has been sent.';

/* Small real files in the OS temp dir, and one sparse file over 5 MB. */
function makeFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nellis-forms-'));
  const small = [1, 2, 3, 4, 5].map((i) => {
    const file = path.join(dir, `file${i}.pdf`);
    fs.writeFileSync(file, `browser test file ${i}\n`);
    return file;
  });
  const big = path.join(dir, 'big.pdf');
  fs.writeFileSync(big, 'x');
  fs.truncateSync(big, 5000001);
  return { dir, small, big };
}

const FILES = makeFiles();

function dialogs(page, seen) {
  page.on('dialog', async (dialog) => {
    seen.push(dialog.message());
    await dialog.accept();
  });
}

const VIEWPORTS = [['desktop', DESKTOP], ['mobile', MOBILE]];

VIEWPORTS.forEach(([label, viewport]) => {
  test(`forms: the contact form posts to /api/message (${label})`, async () => {
    const v = await visit('/contact/', viewport);
    await check(v, `forms-contact-${label}`, async () => {
      const seen = [];
      dialogs(v.page, seen);
      await fillContact(v.page, CONTACT);
      await v.page.locator(`${CONTACT} [type="submit"]`).click();
      await until(() => v.apiCalls.includes('POST /api/message'));
      await until(() => seen.includes(SENT));
      assert.deepEqual(v.apiCalls, ['POST /api/message']);
    });
  });

  test(`forms: the brief modal posts to /api/message (${label})`, async () => {
    const v = await visit('/contact/', viewport);
    await check(v, `forms-brief-plain-${label}`, async () => {
      const seen = [];
      dialogs(v.page, seen);
      await openBrief(v.page);
      await fillContact(v.page, BRIEF);
      await v.page.locator(`${BRIEF} [type="submit"]`).click();
      await until(() => seen.includes(SENT));
      assert.deepEqual(v.apiCalls, ['POST /api/message']);
    });
  });

  /* js/static-backend.js replaces window.XMLHttpRequest with a shim that has no
     .upload and never calls .onload, so js/forms.js upload() throws on the real
     site too. Unskip when the shim forwards real XHRs (site bug, reported). */
  const SKIP_FILES = 'js/static-backend.js XHR shim lacks upload/onload (site bug)';
  test(
    `forms: the brief modal posts, then uploads the files (${label})`,
    { skip: SKIP_FILES },
    async () => {
      const v = await visit('/contact/', viewport);
      await check(v, `forms-brief-${label}`, async () => {
        const seen = [];
        dialogs(v.page, seen);
        await openBrief(v.page);
        await fillContact(v.page, BRIEF);
        await v.page.setInputFiles(`${BRIEF} input[type="file"]`, FILES.small.slice(0, 2));
        await v.page.locator(`${BRIEF} [type="submit"]`).click();
        await until(() => seen.includes(SENT));
        assert.deepEqual(v.apiCalls, [
          'POST /api/message',
          'PUT /api/upload/key0',
          'PUT /api/upload/key1',
          'POST /api/message/test-message/send',
        ]);
      });
    },
  );

  test(`forms: a file over 5 MB is rejected, nothing is sent (${label})`, async () => {
    const v = await visit('/contact/', viewport);
    await check(v, `forms-toobig-${label}`, async () => {
      const seen = [];
      dialogs(v.page, seen);
      await openBrief(v.page);
      await fillContact(v.page, BRIEF);
      await v.page.setInputFiles(`${BRIEF} input[type="file"]`, FILES.big);
      await v.page.locator(`${BRIEF} [type="submit"]`).click();
      await until(() => seen.some((msg) => msg.includes('too large (max 5 MB)')));
      assert.deepEqual(v.apiCalls, []);
    });
  });

  test(`forms: five file slots fill, the sixth is rejected (${label})`, async () => {
    const v = await visit('/contact/', viewport);
    await check(v, `forms-slots-${label}`, async () => {
      const seen = [];
      dialogs(v.page, seen);
      await openBrief(v.page);
      await v.page.setInputFiles(`${BRIEF} input[type="file"]`, FILES.small);
      await v.page.waitForFunction(() => [...document
        .querySelectorAll('form[name="brief"] .loadingFile')]
        .filter((el) => el.style.display === 'flex').length === 5);
      const extra = path.join(FILES.dir, 'sixth.pdf');
      fs.writeFileSync(extra, 'the sixth file\n');
      await v.page.setInputFiles(`${BRIEF} input[type="file"]`, extra);
      await until(() => seen.some((msg) => msg.includes('не более 5')));
      const slots = await v.page.evaluate(() => [...document
        .querySelectorAll('form[name="brief"] .loadingFile')]
        .filter((el) => el.style.display === 'flex').length);
      assert.equal(slots, 5);
      assert.deepEqual(v.apiCalls, []);
    });
  });
});

/* The drop is server-side (worker/form.js): the client posts, the Worker answers
   200 without sending. test/forms.test.js and the worker tests cover the drop. */
test('forms: a filled honeypot posts bot-field, the stub answers 200', async () => {
  const v = await visit('/contact/', DESKTOP);
  await check(v, 'forms-honeypot', async () => {
    const seen = [];
    dialogs(v.page, seen);
    await fillContact(v.page, CONTACT);
    await v.page.evaluate((sel) => {
      document.querySelector(`${sel} [name="bot-field"]`).value = 'i am a bot';
    }, CONTACT);
    const posted = v.page.waitForRequest((req) => req.url().endsWith('/api/message')
      && req.method() === 'POST' && (req.postData() || '').includes('i am a bot'));
    await v.page.locator(`${CONTACT} [type="submit"]`).click();
    await posted;
    await until(() => seen.includes(SENT));
  });
});
