const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const {
  head, top, affiliations, footer,
} = require('../chrome');
const { DOMAIN, pageUrl, seoTokens } = require('../seo');
const { picture } = require('../images');

const FALLBACK_SRC = '/wp-content/themes/nellis/assets/img/minis.png';
const MAX = 160;

/* Root-relative path of a local image hero (CMS heroes are absolute URLs); else null. */
function heroPath(p) {
  const hero = p.hero || '';
  if (!hero.startsWith(`${DOMAIN}/`) || !/\.(jpe?g|png|webp|gif)$/i.test(hero)) return null;
  return hero.slice(DOMAIN.length);
}

/* Plain text, max 160 characters, cut at a word boundary. Not escaped. */
function excerpt(p) {
  const first = (p.html || '').match(/<p>([\s\S]*?)<\/p>/);
  const text = (p.description || (first ? first[1].replace(/<[^>]*>/g, '') : ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX) return text;
  const cut = text.slice(0, MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut.slice(0, MAX - 1)).replace(/[\s,.;:]+$/, '')}…`;
}

/* The first card is the page priority image. */
function items(posts, manifest) {
  const tpl = loadPartial('news-item');
  return posts.map((p, i) => fill(tpl, {
    HREF: escAttr(`/news/${p.slug}/`),
    PICTURE: picture({
      src: heroPath(p) || FALLBACK_SRC, alt: p.hero_alt || p.title, slot: 'teaser', priority: !i,
    }, manifest),
    ISO: p.dateObj.toISOString().slice(0, 10),
    DATE: escText(p.date),
    TITLE: escText(p.title),
    EXCERPT: escText(excerpt(p)),
  })).join('\n');
}

function schema(url, name, desc) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name,
        description: desc,
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
          { '@type': 'ListItem', position: 2, name: 'News' },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, {
  site, newsHref, page, posts, manifest = {},
}) {
  if (!posts || !posts.length) throw new Error('news/: no posts');
  const seo = content.seo || {};
  const headHtml = head({
    BEFORE: '',
    OG_TYPE: 'website',
    MODIFIED_TIME: '',
    SCHEMA: schema(pageUrl(page.slug), seo.title || content.h1, seo.description || ''),
    ...seoTokens(content, page),
  // Shortcut: no dates, so drop the empty modified_time line (as on the category pages).
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(content.h1, site),
    fill(loadPartial('page-news'), {
      NEWS_HREF: escAttr(newsHref),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      H1: escText(content.h1),
      INTRO: escText(content.intro),
      ITEMS: items(posts, manifest),
    }),
    footer(),
  ].join('\n');
}

module.exports = {
  render, heroPath, excerpt, FALLBACK_SRC,
};
