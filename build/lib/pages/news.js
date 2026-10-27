const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const {
  head, top, affiliations, navPlain, footer, emailTokens,
} = require('../chrome');
const { DOMAIN, pageUrl, seoTokens } = require('../seo');
const { picture } = require('../images');

const FALLBACK_SRC = '/wp-content/themes/nellis/assets/img/minis.png';
const MAX = 160;
const IND = ' '.repeat(20);
const SEP = '<span aria-hidden="true">›</span>';

/* The news categories in the approved order. The post front matter `category` is the key.
   admin/config.yml repeats the slugs and names in the select of the news collection. */
const NEWS_CATEGORIES = {
  'villa-design-architecture': {
    name: 'Villa Design & Architecture',
    description: 'Articles from Nellis Architecture on luxury villa design and architecture in '
      + 'Dubai: climate, privacy, views, materials and homes that are built to last.',
  },
  'interior-design': {
    name: 'Interior Design',
    description: 'Interior design articles from Nellis Architecture: bespoke villa interiors, '
      + 'kitchens, bathrooms, joinery, light and calm, lasting materials for Dubai homes.',
  },
  'landscape-outdoor-living': {
    name: 'Landscape & Outdoor Living',
    description: 'Landscape and outdoor living articles from Nellis Architecture: gardens, shade, '
      + 'pools, water features and indoor-outdoor living in the hot Gulf climate.',
  },
  'dubai-lifestyle-trends': {
    name: 'Dubai Lifestyle & Trends',
    description: 'Articles from Nellis Architecture on Dubai lifestyle and design trends: smart '
      + 'homes, regional identity, the future of living and why clients choose Dubai.',
  },
  'studio-news-culture': {
    name: 'Studio News & Culture',
    description: 'News from the Nellis Architecture studio in Dubai: awards, team stories, partner '
      + 'visits, design events and our reflections on how we work and how we grow.',
  },
};
const categoryHref = (slug) => `/news/category/${slug}/`;

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

/* Breadcrumb after Home. /news/: News is the current page. */
function crumbs(cat) {
  if (!cat) return `${IND}<span aria-current="page">News</span>`;
  return `${IND}<a href="/news/">News</a> ${SEP}\n`
    + `${IND}<span aria-current="page">${escText(NEWS_CATEGORIES[cat].name)}</span>`;
}

/* /news/ only: links to the category pages. Category pages: empty. */
function categoryLinks(cat) {
  if (cat) return '';
  const links = Object.entries(NEWS_CATEGORIES).map(([slug, c]) => `${IND}<a href="${
    escAttr(categoryHref(slug))}">${escText(c.name)}</a>`);
  return `\n${' '.repeat(16)}<nav class="projectBreadcrumbs" aria-label="Categories">\n`
    + `${links.join(' <span aria-hidden="true">·</span>\n')}\n${' '.repeat(16)}</nav>`;
}

function schema(url, name, desc, cat) {
  const tail = cat
    ? [{
      '@type': 'ListItem', position: 2, name: 'News', item: `${DOMAIN}/news/`,
    }, { '@type': 'ListItem', position: 3, name: NEWS_CATEGORIES[cat].name }]
    : [{ '@type': 'ListItem', position: 2, name: 'News' }];
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
          ...tail,
        ],
      },
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, {
  site, page, posts: all, manifest = {},
}) {
  const posts = page.category ? (all || []).filter((p) => p.category === page.category) : all;
  if (!posts || !posts.length) throw new Error(`${page.slug}/: no posts`);
  const seo = content.seo || {};
  const headHtml = head({
    BEFORE: '',
    OG_TYPE: 'website',
    MODIFIED_TIME: '',
    SCHEMA: schema(
      pageUrl(page.slug),
      seo.title || content.h1,
      seo.description || '',
      page.category,
    ),
    ...seoTokens(content, page),
  // Shortcut: no dates, so drop the empty modified_time line (as on the category pages).
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(content.h1, site),
    fill(loadPartial('page-news'), {
      NAV: navPlain(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      CRUMBS: crumbs(page.category),
      ...emailTokens(site),
      H1: escText(content.h1),
      INTRO: escText(content.intro),
      CATEGORY_LINKS: categoryLinks(page.category),
      ITEMS: items(posts, manifest),
    }),
    footer(site),
  ].join('\n');
}

module.exports = {
  render, heroPath, excerpt, categoryHref, FALLBACK_SRC, NEWS_CATEGORIES,
};
