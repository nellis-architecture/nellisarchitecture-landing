const fs = require('node:fs');
const path = require('node:path');
const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const {
  head, top, affiliations, navPlain, footer,
} = require('../chrome');
const {
  DOMAIN, organization, pageUrl, seoTokens,
} = require('../seo');
const {
  CATEGORIES, CATEGORY_KEYS, categoryHref, inCategory,
} = require('../projects');
const {
  picture, originalOf, uploadUrl, readManifest,
} = require('../images');

/* The /projects/ hub uses this module with category 'all'. */
const HUB = 'all';
const HUB_HREF = '/projects/';
const IND = ' '.repeat(20);
const SEP = '<span aria-hidden="true">›</span>';

/* Home grid thumbnails: the upload of data/search.json minImg (a variant), by project title. */
function thumbs(root, manifest) {
  const list = JSON.parse(fs.readFileSync(path.join(root, 'data', 'search.json'), 'utf8'));
  const original = (src) => {
    const p = src && originalOf(src, manifest);
    return p ? uploadUrl(p) : src;
  };
  return Object.fromEntries(list.map((s) => [s.title, original(s.minImg)]));
}

/* Projects of the category (hub: all projects), in data/projects.json order. */
function members(projects, cat) {
  const list = cat === HUB ? projects : projects.filter((e) => inCategory(e, cat));
  if (!list.length) throw new Error(`projects/${cat}/: no project in this category`);
  return list;
}

/* An empty line (Atelier, W44, Zephyr have no area) gets no <br>. */
function location(p) {
  return [p.project_rigth1, p.project_rigth2]
    .filter((t) => t && t.trim())
    .map(escText)
    .join(` <br>\n${' '.repeat(28)}`);
}

/* The first card is the page priority image. */
function items(list, thumb, manifest) {
  const tpl = loadPartial('category-item');
  return list.map((e, i) => {
    if (!thumb[e.name]) throw new Error(`data/search.json: ${e.name}: no minImg`);
    return fill(tpl, {
      HREF: escAttr(e.url),
      NAME_ATTR: escAttr(e.name),
      IMG: picture({
        src: thumb[e.name], alt: e.name, slot: 'card', cls: 'project__item-img', priority: !i,
      }, manifest),
      NAME: escText(e.name),
      LOCATION: location(e.p),
    });
  }).join('\n');
}

const labelOf = (cat) => (cat === HUB ? 'Projects' : CATEGORIES[cat].label);

/* Breadcrumb after Home. Hub: Projects is the current page. */
function crumbs(cat, label) {
  const current = `${IND}<span aria-current="page">${escText(label)}</span>`;
  if (cat === HUB) return current;
  return `${IND}<a href="${HUB_HREF}">Projects</a> ${SEP}\n${current}`;
}

/* Hub only: links to the category pages. Category pages: empty. */
function categoryLinks(cat) {
  if (cat !== HUB) return '';
  const links = CATEGORY_KEYS.map((k) => `${IND}<a href="${escAttr(categoryHref(k))}">`
    + `${escText(CATEGORIES[k].label)}</a>`);
  return `\n${' '.repeat(16)}<nav class="projectBreadcrumbs" aria-label="Categories">\n`
    + `${links.join(' <span aria-hidden="true">·</span>\n')}\n${' '.repeat(16)}</nav>`;
}

function schema(url, name, desc, cat, label, follow) {
  const hubItem = {
    '@type': 'ListItem', position: 2, name: 'Projects', item: DOMAIN + HUB_HREF,
  };
  const tail = cat === HUB
    ? [{ '@type': 'ListItem', position: 2, name: label }]
    : [hubItem, { '@type': 'ListItem', position: 3, name: label }];
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
      ...(cat === HUB ? [organization(follow)] : []),
    ],
  }).replace(/</g, '\\u003c');
}

function render(content, {
  site, page, root, projects, manifest = readManifest(root),
}) {
  const label = labelOf(page.category);
  const list = members(projects, page.category);
  const thumb = thumbs(root, manifest);
  const seo = content.seo || {};
  const headHtml = head({
    BEFORE: '',
    OG_IMAGE: `  <meta property="og:image" content="${escAttr(DOMAIN + thumb[list[0].name])}">`,
    OG_TYPE: 'website',
    MODIFIED_TIME: '',
    SCHEMA: schema(
      pageUrl(page.slug),
      seo.title || content.h1,
      seo.description || '',
      page.category,
      label,
      site.follow,
    ),
    ...seoTokens(content, page),
  // Shortcut: no dates, so drop the empty modified_time line (as on project pages).
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(content.h1, site),
    fill(loadPartial('page-category'), {
      NAV: navPlain(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '    '),
      CRUMBS: crumbs(page.category, label),
      H1: escText(content.h1),
      INTRO: escText(content.intro),
      CATEGORY_LINKS: categoryLinks(page.category),
      ITEMS: items(list, thumb, manifest),
    }),
    footer(site),
  ].join('\n');
}

module.exports = {
  render, members, location,
};
