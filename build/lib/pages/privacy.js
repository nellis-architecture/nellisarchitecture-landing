const {
  escText, fill, loadPartial,
} = require('../html');
const {
  head, top, affiliations, navPlain, footer, emailTokens,
} = require('../chrome');
const { seoTokens } = require('../seo');

/* Fixed head values, raw HTML. SEO values come from content.seo (seoTokens). */
/* eslint-disable @stylistic/max-len -- raw WordPress head values, kept byte for byte */
const HEAD = {
  BEFORE: '\n\n',
  OG_TYPE: 'article',
  MODIFIED_TIME: '2026-04-24T06:09:48+00:00',
  SCHEMA: '{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/","url":"https:\\/\\/nellisarchitecture.com\\/privacy\\/","name":"Privacy Policy | Data Protection & User Privacy | Nellis Architecture","isPartOf":{"@id":"https:\\/\\/nellisarchitecture.com\\/#website"},"datePublished":"2025-03-10T18:42:08+00:00","dateModified":"2026-04-24T06:09:48+00:00","description":"Lees het privacybeleid van Nellis Architecture. Ontdek hoe wij persoonlijke gegevens verzamelen, gebruiken en beschermen volgens de geldende privacywetgeving.","breadcrumb":{"@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/#breadcrumb"},"inLanguage":"en-US","potentialAction":[{"@type":"ReadAction","target":["https:\\/\\/nellisarchitecture.com\\/privacy\\/"]}]},{"@type":"BreadcrumbList","@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https:\\/\\/nellisarchitecture.com\\/"},{"@type":"ListItem","position":2,"name":"Political"}]},{"@type":"WebSite","@id":"https:\\/\\/nellisarchitecture.com\\/#website","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture","description":"","potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\\/\\/nellisarchitecture.com\\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"en-US"}]}',
};
/* eslint-enable @stylistic/max-len */

/* Plain-text body: each text line ends with <br><br>, except the last; blank lines stay blank. */
function bodyLines(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  return lines.map((line, i) => {
    if (!line.trim()) return '';
    return i === lines.length - 1 ? escText(line) : `${escText(line)}<br><br>`;
  }).join('\n');
}

function render(content, { site, page }) {
  return [
    head({ ...HEAD, ...seoTokens(content, page) }),
    top(content.h1, site),
    fill(loadPartial('page-privacy'), {
      NAV: navPlain(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      ...emailTokens(site),
      TITLE: escText(content.title),
      BODY: bodyLines(content.body),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render, bodyLines };
