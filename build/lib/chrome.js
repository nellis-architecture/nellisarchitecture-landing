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

const HOOK = {
  '/projects/': 'projectPage',
  '/studio/': 'studioPage',
  '/people/': 'projectPeople',
  '/news/': 'newsPage',
  '/contact/': 'contactPage',
};

/* A link with no rule gets no hook class and no highlight; the build still succeeds.
   Object.hasOwn, as in build/lib/html.js:23, so a link named "constructor" finds nothing. */
const hookOf = (link) => (Object.hasOwn(HOOK, link) ? HOOK[link] : '');

/* The class value comes from HOOK, not from the CMS, so it needs no escaping. */
const classAttr = (c) => (c ? ` class="${c}"` : '');

const PAD = {
  item: ' '.repeat(14),
  link: ' '.repeat(16),
  cLink: ' '.repeat(28),
  cItem: ' '.repeat(32),
  follow: ' '.repeat(10),
  followLink: ' '.repeat(12),
};

/* Shape A: page-index (Home and the 32 project pages), page-studio, page-people. */
function navSite(items) {
  return items.map((it) => {
    const cls = hookOf(it.link);
    return `${PAD.item}<li class="nav-item">\n`
      + `${PAD.link}<a href="${escAttr(it.link)}"${classAttr(cls)} style="margin-left: 0;">`
      + `${escText(it.label)}</a>\n`
      + `${PAD.item}</li>`;
  }).join('\n');
}

/* Shape C: page-privacy, page-news, page-contact, page-category.
   The fixed nav-item class sits on the <a>, the hook on the <li>. */
function navPlain(items) {
  return items.map((it) => `${PAD.cLink}<a href="${escAttr(it.link)}" class="nav-item">\n`
    + `${PAD.cItem}<li${classAttr(hookOf(it.link))}>${escText(it.label)}</li>\n`
    + `${PAD.cLink}</a>`).join('\n');
}

/* Shape D: build/news-template.html. Shape A without the style attribute, and the
   newsPage hook sits on the <li> with no class on the <a>. */
function navPost(items) {
  return items.map((it) => {
    const cls = hookOf(it.link);
    const onItem = cls === 'newsPage';
    return `${PAD.item}<li class="nav-item${onItem ? ` ${cls}` : ''}">\n`
      + `${PAD.link}<a href="${escAttr(it.link)}"${onItem ? '' : classAttr(cls)}>`
      + `${escText(it.label)}</a>\n`
      + `${PAD.item}</li>`;
  }).join('\n');
}

/* All five Follow copies are byte-identical, indentation included. */
function follow(items) {
  const link = (it) => `${PAD.followLink}<a target="_blank" href="${escAttr(it.link)}">`
    + `${escText(it.label)}</a>`;
  return [
    `${PAD.follow}<div class="follow">`,
    `${PAD.followLink}<span class="name">Follow:</span>`,
    ...items.map(link),
    `${PAD.follow}</div>`,
  ].join('\n');
}

const TEST_SITEKEY = '1x00000000000000000000AA';

/* The Cloudflare build sets TURNSTILE_SITEKEY (npm run infra). Local builds use the test key. */
function sitekey() {
  return escAttr(process.env.TURNSTILE_SITEKEY || TEST_SITEKEY);
}

function emailTokens(site) {
  const { CONTACT_EMAIL_HREF, CONTACT_EMAIL } = formTokens('CONTACT', site.forms.contact);
  const { SKILLS_EMAIL_HREF, SKILLS_EMAIL } = formTokens('SKILLS', site.forms.skills);
  return {
    CONTACT_EMAIL_HREF, CONTACT_EMAIL, SKILLS_EMAIL_HREF, SKILLS_EMAIL,
  };
}

function year() {
  return String(new Date().getUTCFullYear());
}

function footer(site) {
  return fill(loadPartial('footer'), {
    TURNSTILE_SITEKEY: sitekey(), FOLLOW: follow(site.follow), ...emailTokens(site), YEAR: year(),
  });
}

module.exports = {
  head,
  top,
  contactForm,
  affiliations,
  navSite,
  navPlain,
  navPost,
  follow,
  footer,
  sitekey,
  emailTokens,
  year,
};
