const { escText, escAttr } = require('./html');

const DOMAIN = 'https://nellisarchitecture.com';
const LOGO = `${DOMAIN}/wp-content/uploads/2025/02/logo.png`;
/* `follow`: site.json — the CMS owns the social profile URLs. */
const sameAs = (follow) => follow.map((f) => f.link);

const organization = (follow) => ({
  '@type': 'Organization',
  '@id': `${DOMAIN}/#organization`,
  name: 'Nellis Architecture',
  url: `${DOMAIN}/`,
  logo: LOGO,
  sameAs: sameAs(follow),
});
const INDEX = "<meta name='robots' content='index, follow, max-image-preview:large, "
  + "max-snippet:-1, max-video-preview:-1' />";
const NOINDEX = '<meta name="robots" content="noindex">';

const pageUrl = (slug) => (slug ? `${DOMAIN}/${slug}/` : `${DOMAIN}/`);

/* Splice, never merge: a re-stringify would rewrite the `\/` escapes of the Yoast literals. */
const yoastOrganization = (follow) => JSON.stringify(organization(follow)).replace(/\//g, '\\/');

const withOrganization = (schema, follow) => `${schema.slice(0, -2)},`
  + `${yoastOrganization(follow)}]}`;

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
  DOMAIN, INDEX, LOGO, NOINDEX, organization, pageUrl, sameAs, seoTokens, withOrganization,
};
