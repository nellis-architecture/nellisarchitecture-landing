const { escText, fill, loadPartial } = require('../html');
const {
  head, top, affiliations, navPlain, footer, emailTokens,
} = require('../chrome');
const {
  DOMAIN, pageUrl, seoTokens, titleOf,
} = require('../seo');
const { mdToHtml } = require('../markdown');

/* A Studio service page (/studio/<service>/): a markdown text page (content/pages/
   studio-<service>.md) under Home › Studio. */

const SEP = '<span aria-hidden="true">›</span>';

function crumbs(title) {
  return '<nav class="projectBreadcrumbs" aria-label="Breadcrumb">'
    + `<a href="/">Home</a> ${SEP} <a href="/studio/">Studio</a> ${SEP} `
    + `<span aria-current="page">${escText(title)}</span></nav>\n            `;
}

function schema(url, name, description, title) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name,
        description,
        breadcrumb: { '@id': `${url}#breadcrumb` },
        inLanguage: 'en-US',
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem', position: 1, name: 'Home', item: `${DOMAIN}/`,
          },
          {
            '@type': 'ListItem', position: 2, name: 'Studio', item: `${DOMAIN}/studio/`,
          },
          { '@type': 'ListItem', position: 3, name: title },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, { site, page }) {
  const seo = content.seo || {};
  const url = seo.canonical || pageUrl(page.slug);
  const headHtml = head({
    BEFORE: '',
    OG_TYPE: 'article',
    MODIFIED_TIME: '',
    SCHEMA: schema(url, titleOf(content), seo.description || '', content.title),
    ...seoTokens(content, page),
  // Shortcut: no dates, so drop the empty modified_time line (as on the category pages).
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(content.h1, site),
    fill(loadPartial('page-text'), {
      NAV: navPlain(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      ...emailTokens(site),
      CRUMBS: crumbs(content.title),
      TITLE: escText(content.title),
      BODY: mdToHtml(content.body || '', {}, { ids: true }),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render };
