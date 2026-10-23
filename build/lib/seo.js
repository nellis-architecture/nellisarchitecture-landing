const { escText, escAttr } = require('./html');

const DOMAIN = 'https://nellisarchitecture.com';
const LOGO = `${DOMAIN}/wp-content/uploads/2025/02/logo.png`;
const SAME_AS = [
  'https://www.instagram.com/nellis.architecture/',
  'https://www.linkedin.com/company/nellis-architecture/',
  'https://www.youtube.com/@NellisArchitecture',
];
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${DOMAIN}/#organization`,
  name: 'Nellis Architecture',
  url: `${DOMAIN}/`,
  logo: LOGO,
  sameAs: SAME_AS,
};
const INDEX = "<meta name='robots' content='index, follow, max-image-preview:large, "
  + "max-snippet:-1, max-video-preview:-1' />";
const NOINDEX = '<meta name="robots" content="noindex">';

const pageUrl = (slug) => (slug ? `${DOMAIN}/${slug}/` : `${DOMAIN}/`);

/* Splice, never merge: a re-stringify would rewrite the `\/` escapes of the Yoast literals. */
const YOAST_ORGANIZATION = JSON.stringify(ORGANIZATION).replace(/\//g, '\\/');
const withOrganization = (schema) => `${schema.slice(0, -2)},${YOAST_ORGANIZATION}]}`;

/* Head tokens from the page's `seo` object. The slug is fixed in the PAGES registry. */
function seoTokens(content, page) {
  const seo = content.seo || {};
  if (seo.canonical && !seo.canonical.startsWith(`${DOMAIN}/`)) {
    throw new Error(`seo.canonical must start with ${DOMAIN}/: ${seo.canonical}`);
  }
  const title = seo.title || content.title || content.h1;
  const url = seo.canonical || pageUrl(page.slug);
  return {
    TITLE: escText(title),
    OG_TITLE: escAttr(seo.og_title || title),
    DESCRIPTION: escAttr(seo.description),
    OG_DESCRIPTION: escAttr(seo.description),
    CANONICAL: escAttr(url),
    OG_URL: escAttr(url),
    ROBOTS: seo.noindex ? NOINDEX : INDEX,
  };
}

module.exports = {
  DOMAIN, INDEX, LOGO, NOINDEX, ORGANIZATION, SAME_AS, pageUrl, seoTokens, withOrganization,
};
