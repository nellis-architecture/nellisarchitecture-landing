const {
  escText, escAttr, fill, lazyImg, loadPartial,
} = require('./html');

const OG_IMAGE = [
  // eslint-disable-next-line @stylistic/max-len -- raw WordPress head value, kept byte for byte
  '  <meta property="og:image" content="https://nellisarchitecture.com/wp-content/themes/nellis/assets/img/minis.png">',
  '  <meta property="og:image:width" content="968">',
  '  <meta property="og:image:height" content="504">',
].join('\n');

function head(values) {
  return fill(loadPartial('head'), {
    EARLY_SCRIPT: '', PRELOAD: '', OG_IMAGE, IMAGES_CSS: loadPartial('images-css'), ...values,
  });
}

function formTokens(prefix, form) {
  return {
    [`${prefix}_TITLE`]: escText(form.title),
    [`${prefix}_DESCRIPTION`]: escText(form.description),
    [`${prefix}_BUTTON`]: escText(form.button),
    [`${prefix}_EMAIL_HREF`]: escAttr(form.email),
    [`${prefix}_EMAIL`]: escText(form.email),
  };
}

/* formId: ' id="yourFormId"' in the modal (theme markup); '' on /contact/. */
function contactForm(formId, form) {
  return fill(loadPartial('contact-form'), { FORM_ID: formId, BUTTON: escText(form.button) });
}

function top(h1, site) {
  const { CONTACT_BUTTON: _, ...contact } = formTokens('CONTACT', site.forms.contact);
  return fill(loadPartial('top'), {
    H1: escText(h1),
    CONTACT_FORM: contactForm(' id="yourFormId"', site.forms.contact),
    ...contact,
    ...formTokens('SKILLS', site.forms.skills),
  });
}

/* indent: one indent level of the host page (index uses 2 spaces, privacy 4).
   level: nesting depth of the partner div (Studio nests one level deeper). */
function affiliations(items, indent, level = 7) {
  const pad = (n) => indent.repeat(n);
  return items.map((img) => `${pad(level)}<div class="partner">\n`
    + `${pad(level + 1)}${lazyImg(img)}\n`
    + `${pad(level)}</div>`).join('\n');
}

const TEST_SITEKEY = '1x00000000000000000000AA';

/* The Cloudflare build sets TURNSTILE_SITEKEY (npm run infra). Local builds use the test key. */
function sitekey() {
  return escAttr(process.env.TURNSTILE_SITEKEY || TEST_SITEKEY);
}

function footer() {
  return fill(loadPartial('footer'), { TURNSTILE_SITEKEY: sitekey() });
}

module.exports = {
  head, top, contactForm, affiliations, footer, sitekey,
};
