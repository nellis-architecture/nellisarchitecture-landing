const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../worker/email.js');
const fields = {
  form: 'brief', name: 'Ann', email: 'ann@example.com', phone: '1', message: 'Hello\nthere',
};

test('the brief (job) form goes to people@, the contact (client) form to hello@', async () => {
  const { recipient } = await load();
  assert.equal(recipient(fields), 'people@nellisarchitecture.com');
  assert.equal(recipient({ ...fields, form: 'contact' }), 'hello@nellisarchitecture.com');
});

test('body lists the fields, then the message', async () => {
  const { body } = await load();
  const want = 'Form: brief\nName: Ann\nEmail: ann@example.com\nPhone: 1\n\nHello\nthere\n';
  assert.equal(body(fields), want);
});

test('send uses MAIL_FROM, a fixed subject and replyTo the sender', async () => {
  const { send, body } = await load();
  const calls = [];
  const env = {
    MAIL_FROM: 'noreply@forms.nellisarchitecture.com',
    EMAIL: { send: async (m) => calls.push(m) },
  };
  await send(env, { ...fields, form: 'contact' });
  assert.deepEqual(calls, [{
    from: 'noreply@forms.nellisarchitecture.com',
    to: 'hello@nellisarchitecture.com',
    replyTo: 'ann@example.com',
    subject: 'Form submitted on the website',
    text: body({ ...fields, form: 'contact' }),
  }]);
});

test('body lists one link for each file after the message', async () => {
  const { body } = await load();
  const links = [{ name: 'a.pdf', url: 'https://x.dev/api/file/1?sig=s' }];
  const want = 'Form: brief\nName: Ann\nEmail: ann@example.com\nPhone: 1\n\nHello\nthere\n\n'
    + 'Files:\na.pdf: https://x.dev/api/file/1?sig=s\n';
  assert.equal(body(fields, links), want);
});
