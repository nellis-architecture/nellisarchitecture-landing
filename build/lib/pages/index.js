const { escAttr, fill, loadPartial } = require('../html');
const {
  head, top, affiliations, footer, emailTokens, year,
} = require('../chrome');
const { seoTokens, withOrganization } = require('../seo');
const { earlyScript } = require('../projects');
const { prioritize } = require('../images');

/* Fixed head values, raw HTML. SEO values come from content.seo (seoTokens). */
/* eslint-disable @stylistic/max-len -- raw WordPress head values, kept byte for byte */
const HEAD = {
  BEFORE: '',
  OG_TYPE: 'website',
  MODIFIED_TIME: '2026-04-23T11:09:57+00:00',
  SCHEMA: withOrganization('{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\\/\\/nellisarchitecture.com\\/","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture | Award-Winning Architectural Design Firm","isPartOf":{"@id":"https:\\/\\/nellisarchitecture.com\\/#website"},"datePublished":"2025-02-15T22:04:15+00:00","dateModified":"2026-04-23T11:09:57+00:00","description":"Nellis Architecture is one of the best architecture firms in Dubai, delivering award-winning residential, commercial, and bespoke architectural design solutions.","breadcrumb":{"@id":"https:\\/\\/nellisarchitecture.com\\/#breadcrumb"},"inLanguage":"en-US","potentialAction":[{"@type":"ReadAction","target":["https:\\/\\/nellisarchitecture.com\\/"]}]},{"@type":"BreadcrumbList","@id":"https:\\/\\/nellisarchitecture.com\\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home"}]},{"@type":"WebSite","@id":"https:\\/\\/nellisarchitecture.com\\/#website","url":"https:\\/\\/nellisarchitecture.com\\/","name":"Nellis Architecture","description":"","potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\\/\\/nellisarchitecture.com\\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"en-US"}]}'),
};
/* eslint-enable @stylistic/max-len */

/* The project overlay stays closed and empty on Home: each project has its own page. */
const CLOSED_PROJECT = {
  OPEN_CLASS: '',
  BREADCRUMB: '',
  NAME: '',
  AREA: '',
  REGION: '',
  HERO: '',
  CONTENT: '',
  TYPE_SET: '',
};

function render(content, {
  site, newsHref, page, projects,
}) {
  return [
    head({ ...HEAD, EARLY_SCRIPT: earlyScript(projects), ...seoTokens(content, page) }),
    top(content.h1, site),
    fill(loadPartial('page-index'), {
      NEWS_HREF: escAttr(newsHref),
      AFFILIATIONS: affiliations(site.affiliations, '  '),
      ...emailTokens(site),
      /* The first grid image is the page priority image. */
      PROJECTS: prioritize(fill(loadPartial('index-projects'), {
        CENTER_CLASS: '',
        ...emailTokens(site),
        YEAR: year(),
        CURRENT_PROJECT: fill(loadPartial('current-project'), {
          ...CLOSED_PROJECT, ...emailTokens(site), YEAR: year(),
        }),
      })),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render };
