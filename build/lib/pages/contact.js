const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const {
  head, top, contactForm, affiliations, footer,
} = require('../chrome');
const {
  DOMAIN, LOGO, pageUrl, seoTokens,
} = require('../seo');

const SAME_AS = [
  'https://www.instagram.com/nellis.architecture/',
  'https://www.linkedin.com/company/nellis-architecture/',
  'https://www.youtube.com/@NellisArchitecture',
];
// Shortcut: the schema address parts are fixed here; content.address is not split.
// Upgrade: CMS fields for the address parts, once the office moves.
const POSTAL = {
  '@type': 'PostalAddress',
  streetAddress: 'Ground Floor, Building 4, Mangrove Avenue A, Sustainability District',
  addressLocality: 'Dubai',
  addressCountry: 'AE',
};

const MAPS = 'https://www.google.com/maps/search/?api=1&query=';
const mapLink = (address) => `${MAPS}${encodeURIComponent(address)}`;

function schema(url, name, desc, email) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        '@id': url,
        url,
        name,
        description: desc,
        isPartOf: { '@id': `${DOMAIN}/#website` },
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
          { '@type': 'ListItem', position: 2, name: 'Contact' },
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${DOMAIN}/#localbusiness`,
        name: 'Nellis Architecture',
        url: `${DOMAIN}/`,
        email,
        image: LOGO,
        logo: LOGO,
        address: POSTAL,
        sameAs: SAME_AS,
      },
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, { site, newsHref, page }) {
  if (!content.address || !content.address.trim()) throw new Error('contact/: no address');
  const seo = content.seo || {};
  const { email } = site.forms.contact;
  const headHtml = head({
    BEFORE: '',
    OG_TYPE: 'website',
    MODIFIED_TIME: '',
    SCHEMA: schema(pageUrl(page.slug), seo.title || content.h1, seo.description || '', email),
    ...seoTokens(content, page),
  // Shortcut: no dates, so drop the empty modified_time line (as on /news/).
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(content.h1, site),
    fill(loadPartial('page-contact'), {
      NEWS_HREF: escAttr(newsHref),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      H1: escText(content.h1),
      INTRO: escText(content.intro),
      ADDRESS: escText(content.address),
      MAP_HREF: escAttr(mapLink(content.address)),
      EMAIL_HREF: escAttr(email),
      EMAIL: escText(email),
      FORM: contactForm('', site.forms.contact),
    }),
    footer(),
  ].join('\n');
}

module.exports = { render, schema, mapLink };
