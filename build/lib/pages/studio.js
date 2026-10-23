const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const { picture } = require('../images');
const {
  head, top, affiliations, footer,
} = require('../chrome');
const { seoTokens, withOrganization } = require('../seo');

/* Fixed head values, raw HTML. SEO values come from content.seo (seoTokens). */
/* eslint-disable @stylistic/max-len -- raw WordPress head values, kept byte for byte */
const HEAD = {
  BEFORE: '',
  OG_TYPE: 'article',
  MODIFIED_TIME: '2026-04-24T06:23:40+00:00',
  SCHEMA: withOrganization('{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\\/\\/nellisarchitecture.com\\/studio\\/","url":"https:\\/\\/nellisarchitecture.com\\/studio\\/","name":"Architecture Studio Dubai | Luxury Villa Design & Interiors","isPartOf":{"@id":"https:\\/\\/nellisarchitecture.com\\/#website"},"datePublished":"2025-02-15T21:05:18+00:00","dateModified":"2026-04-24T06:23:40+00:00","description":"Discover Nellis Architecture Studio in Dubai. Experts in luxury villa design, master planning, interiors, and landscape architecture for high-end residential and investment projects.","breadcrumb":{"@id":"https:\\/\\/nellisarchitecture.com\\/studio\\/#breadcrumb"},"inLanguage":"en-US","potentialAction":[{"@type":"ReadAction","target":["https:\\/\\/nellisarchitecture.com\\/studio\\/"]}]},{"@type":"BreadcrumbList","@id":"https:\\/\\/nellisarchitecture.com\\/studio\\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https:\\/\\/nellisarchitecture.com\\/"},{"@type":"ListItem","position":2,"name":"Architecture Studio Dubai"}]},{"@type":"WebSite","@id":"https:\\/\\/nellisarchitecture.com\\/#website","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture","description":"","potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\\/\\/nellisarchitecture.com\\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"en-US"}]}'),
};
/* eslint-enable @stylistic/max-len */

/* Quote text: each line break becomes <br>. */
function quoteLines(text) {
  return String(text || '').trim().split(/\r?\n/)
    .map(escText)
    .join('<br>');
}

function services({ button, items }) {
  const tpl = loadPartial('studio-service');
  return items.map((s) => fill(tpl, {
    LINK: escAttr(s.link),
    TITLE: escText(s.title),
    BUTTON: escText(button),
  })).join('\n');
}

/* Marquee item. The theme loop gives the first item and the next items different indents. */
function values(items, first, next, indent) {
  const pad = (n) => ' '.repeat(n);
  return items.map((v, i) => `${pad(i ? next : first)}<div class="sprintLine__item">\n`
    + `${pad(indent + 2)}<h3>${escText(v.title)}:</h3>\n`
    + `${pad(indent + 2)}<p>\n`
    + `${pad(indent + 4)}${escText(v.text)}${pad(indent + 2)}</p>\n`
    + `${pad(indent)}</div>`).join('\n');
}

/* The intro photo is the page priority image. */
function render(content, {
  site, newsHref, page, manifest,
}) {
  const { intro, founder } = content;
  const pic = (img, slot, more) => picture({
    src: img.src, alt: img.alt, title: img.title, slot, ...more,
  }, manifest);
  return [
    head({ ...HEAD, ...seoTokens(content, page) }),
    top(content.h1, site),
    fill(loadPartial('page-studio'), {
      NEWS_HREF: escAttr(newsHref),
      AFFILIATIONS: affiliations(site.affiliations, '  ', 8),
      INTRO_TITLE_ATTR: escAttr(intro.title),
      INTRO_TITLE: escText(intro.title),
      INTRO_SUBTITLE: escText(intro.subtitle),
      INTRO_PHOTO: pic(intro.photo, 'portrait', { priority: true }),
      INTRO_QUOTE: quoteLines(intro.quote),
      INTRO_QUOTE_AUTHOR: escText(intro.quote_author),
      PARAGRAPH_1: escText(intro.paragraphs[0]),
      PARAGRAPH_2: escText(intro.paragraphs[1]),
      BIG_IMAGE: pic(intro.big_image, 'wide'),
      SERVICES_TITLE: escText(content.services.title),
      SERVICES: services(content.services),
      VALUES_TITLE: escText(content.values.title),
      VALUES_1: values(content.values.items, 20, 22, 12),
      VALUES_2: values(content.values.items, 18, 16, 10),
      FOUNDER_TITLE: escText(founder.title),
      FOUNDER_QUOTE: escText(founder.quote),
      FOUNDER_PHOTO: pic(founder.photo, 'portrait', { cls: 'photo1' }),
      FOUNDER_LABEL: escText(founder.label),
      FOUNDER_NAME: escText(founder.name),
      FOUNDER_BIO: escText(founder.bio),
      FOUNDER_TEXT: escText(founder.text),
    }),
    footer(),
  ].join('\n');
}

module.exports = {
  render, quoteLines, services, values,
};
