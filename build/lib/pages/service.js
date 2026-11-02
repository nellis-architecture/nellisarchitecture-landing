const { escText, fill, loadPartial } = require('../html');
const {
  head, top, affiliations, navPlain, footer, emailTokens,
} = require('../chrome');
const {
  DOMAIN, pageUrl, seoTokens, titleOf,
} = require('../seo');
const { mdToHtml } = require('../markdown');

/* A markdown text page with a breadcrumb: a Studio service (/studio/<service>/, content/pages/
   studio-<service>.md) under Home › Studio, or a landing page (/<slug>/, content/landing/)
   under Home. */

const SEP = '<span aria-hidden="true">›</span>';

const inStudio = (page) => page.slug.startsWith('studio/');

function crumbs(title, studio) {
  const parent = studio ? `<a href="/studio/">Studio</a> ${SEP} ` : '';
  return '<nav class="projectBreadcrumbs" aria-label="Breadcrumb">'
    + `<a href="/">Home</a> ${SEP} ${parent}`
    + `<span aria-current="page">${escText(title)}</span></nav>\n            `;
}

function schema(url, name, description, title, studio) {
  const parent = studio ? [{ name: 'Studio', item: `${DOMAIN}/studio/` }] : [];
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
        itemListElement: [{ name: 'Home', item: `${DOMAIN}/` }, ...parent, { name: title }]
          .map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
      },
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, { site, page, manifest }) {
  const seo = content.seo || {};
  const url = seo.canonical || pageUrl(page.slug);
  const studio = inStudio(page);
  const headHtml = head({
    BEFORE: page.before || '',
    OG_TYPE: 'article',
    MODIFIED_TIME: '',
    SCHEMA: schema(url, titleOf(content), seo.description || '', content.title, studio),
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
      CRUMBS: crumbs(content.title, studio),
      TITLE: escText(content.title),
      BODY: mdToHtml(content.body || '', manifest, { ids: true }),
    }),
    footer(site),
  ].join('\n');
}

module.exports = { render };
