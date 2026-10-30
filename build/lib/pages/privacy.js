const {
  escText, fill, loadPartial,
} = require('../html');
const {
  head, top, affiliations, navPlain, footer, emailTokens,
} = require('../chrome');
const { seoTokens, yoastString } = require('../seo');
const { DEFAULT_DAYS } = require('../../../infra/lifecycle');
const { mdToHtml } = require('../markdown');

/* Fixed head values, raw HTML. SEO values come from content.seo (seoTokens). */
/* eslint-disable @stylistic/max-len -- raw WordPress head values, kept byte for byte */
const HEAD = {
  BEFORE: '\n\n',
  OG_TYPE: 'article',
  MODIFIED_TIME: '2026-10-30T00:00:00+00:00',
  SCHEMA: '{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/","url":"https:\\/\\/nellisarchitecture.com\\/privacy\\/","name":"Privacy Policy | Data Protection & User Privacy | Nellis Architecture","isPartOf":{"@id":"https:\\/\\/nellisarchitecture.com\\/#website"},"datePublished":"2025-03-10T18:42:08+00:00","dateModified":"2026-10-30T00:00:00+00:00","description":"{{DESCRIPTION}}","breadcrumb":{"@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/#breadcrumb"},"inLanguage":"en-US","potentialAction":[{"@type":"ReadAction","target":["https:\\/\\/nellisarchitecture.com\\/privacy\\/"]}]},{"@type":"BreadcrumbList","@id":"https:\\/\\/nellisarchitecture.com\\/privacy\\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https:\\/\\/nellisarchitecture.com\\/"},{"@type":"ListItem","position":2,"name":"Privacy Policy"}]},{"@type":"WebSite","@id":"https:\\/\\/nellisarchitecture.com\\/#website","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture","description":"","potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\\/\\/nellisarchitecture.com\\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"en-US"}]}',
};
/* eslint-enable @stylistic/max-len */

/* The policy states how long form files are kept. The CMS edits the days (site.json) and the
   text (privacy.md) separately, so the build stops when they disagree. */
function checkFileDays(body, days) {
  if (!new RegExp(`(^|\\D)${days} days\\b`).test(String(body || ''))) {
    throw new Error(`content/pages/privacy.md must state ${days} days, `
      + 'the value of forms.file_days in content/pages/site.json');
  }
}

function render(content, { site, page }) {
  checkFileDays(content.body, site.forms.file_days ?? DEFAULT_DAYS);
  const description = yoastString((content.seo || {}).description);
  return [
    head({
      ...HEAD,
      SCHEMA: HEAD.SCHEMA.replace('{{DESCRIPTION}}', () => description),
      ...seoTokens(content, page),
    }),
    top(content.h1, site),
    fill(loadPartial('page-privacy'), {
      NAV: navPlain(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      ...emailTokens(site),
      TITLE: escText(content.title),
      BODY: mdToHtml(content.body || '', {}, { ids: true }),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render, checkFileDays };
