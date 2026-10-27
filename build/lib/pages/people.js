const {
  escText, fill, loadPartial,
} = require('../html');
const { picture } = require('../images');
const {
  head, top, affiliations, navSite, footer, emailTokens,
} = require('../chrome');
const { seoTokens, withOrganization } = require('../seo');

/* Fixed head values, raw HTML. SEO values come from content.seo (seoTokens). */
/* eslint-disable @stylistic/max-len -- raw WordPress head values, kept byte for byte */
const HEAD = {
  BEFORE: '',
  OG_TYPE: 'article',
  MODIFIED_TIME: '2026-04-24T06:09:07+00:00',
};
const SCHEMA = '{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\\/\\/nellisarchitecture.com\\/people\\/","url":"https:\\/\\/nellisarchitecture.com\\/people\\/","name":"The People | Nellis Architecture Studio Team & Experts Our Team","isPartOf":{"@id":"https:\\/\\/nellisarchitecture.com\\/#website"},"datePublished":"2025-02-16T23:39:25+00:00","dateModified":"2026-04-24T06:09:07+00:00","description":"Meet the passionate team at Nellis Architecture. Our architects, designers, and creative experts bring innovation and artistry to every project.","breadcrumb":{"@id":"https:\\/\\/nellisarchitecture.com\\/people\\/#breadcrumb"},"inLanguage":"en-US","potentialAction":[{"@type":"ReadAction","target":["https:\\/\\/nellisarchitecture.com\\/people\\/"]}]},{"@type":"BreadcrumbList","@id":"https:\\/\\/nellisarchitecture.com\\/people\\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https:\\/\\/nellisarchitecture.com\\/"},{"@type":"ListItem","position":2,"name":"People | Nellis Architecture Studio Team & Experts"}]},{"@type":"WebSite","@id":"https:\\/\\/nellisarchitecture.com\\/#website","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture","description":"","potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\\/\\/nellisarchitecture.com\\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"en-US"}]}';
/* eslint-enable @stylistic/max-len */

function intro(paragraphs) {
  return paragraphs.map((p) => `        <p>\n          ${escText(p)}        </p>`).join('\n');
}

/* Bio keeps its raw line breaks, as on the old site. */
const pic = (img, slot, manifest, priority = false) => picture({
  src: img.src, alt: img.alt, title: img.title, slot, priority,
}, manifest);

function people(items, manifest) {
  const tpl = loadPartial('people-item');
  return items.map((p) => fill(tpl, {
    PHOTO: pic(p.photo, 'person', manifest),
    NAME: escText(p.name),
    ROLE: escText(p.role),
    BIO: escText(p.bio),
  })).join('\n\n\n      \n');
}

/* The intro image is the page priority image. */
function render(content, {
  site, page, manifest,
}) {
  return [
    head({ ...HEAD, SCHEMA: withOrganization(SCHEMA, site.follow), ...seoTokens(content, page) }),
    top(content.h1, site),
    fill(loadPartial('page-people'), {
      NAV: navSite(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '  '),
      ...emailTokens(site),
      TITLE: escText(content.intro.title),
      INTRO: intro(content.intro.paragraphs),
      IMAGE: pic(content.intro.image, 'wide', manifest, true),
      PEOPLE: people(content.people, manifest),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render, intro, people };
