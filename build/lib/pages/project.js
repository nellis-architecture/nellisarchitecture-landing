const {
  escText, escAttr, fill, loadPartial, isVideo,
} = require('../html');
const {
  head, top, affiliations, navSite, follow, footer, emailTokens, year,
} = require('../chrome');
const { DOMAIN, seoTokens } = require('../seo');
const { CATEGORIES, categoryHref, description } = require('../projects');
const {
  picture, zoomSrc, readManifest, heroVideo, preloadLink,
} = require('../images');
const { grid } = require('./grid');

/* eslint-disable @stylistic/max-len -- raw theme SVG, as in the overlay */
const SWIPER_NAV_BUTTON = (cls) => `                    <svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12.172 8.99968L-3.83699e-07 8.99968L-2.96276e-07 6.99968L12.172 6.99968L6.808 1.63568L8.222 0.221679L16 7.99968L8.222 15.7777L6.808 14.3637L12.172 8.99968Z" fill="#00372A" />
                    </svg>`;
/* eslint-enable @stylistic/max-len */

const nonEmpty = (list) => (list || []).filter((t) => t && t.trim());

/* Project texts are HTML from our own data (entities, </br>): output raw, as the overlay does. */
function texts(list, cls) {
  const ps = nonEmpty(list)
    .map((t) => `<p class="parag">${t.replace(/\r\n?/g, '\n')}</p>`)
    .join('');
  return ps && `        <div class="currentProject_container ${cls}">${ps}</div>`;
}

function img(src, alt, priority, manifest) {
  return picture({
    src, alt, slot: 'full', priority, fancybox: 'galleryHI',
  }, manifest);
}

/* The hero image is the page priority image; a video hero gives none. */
function hero(p, name, manifest) {
  const src = p.hero;
  if (isVideo(src)) {
    return `${' '.repeat(8)}<div class="currentProject-heroImg">`
      + `${heroVideo(src, manifest).html}</div>`;
  }
  return `${' '.repeat(8)}<div class="currentProject-heroImg varVideo">`
    + `${img(src, p.hero_alt || name, true, manifest)}</div>`;
}

/* The <a> is the Fancybox trigger: data-src gives it the largest variant. */
function swiper(list, name, gallery, manifest, extra = '') {
  if (!list || !list.length) return '';
  const slides = list.map(({ src, alt }) => `<a class="swiper-slide" href="${escAttr(src)}" `
    + `data-fancybox="${gallery}" data-src="${escAttr(zoomSrc(src, manifest))}">`
    + `${picture({ src, alt: alt || name, slot: 'slide' }, manifest)}</a>`);
  return [
    `        <div class="swiper${extra}">`,
    `            <div class="swiper-wrapper">${slides.join('')}</div>`,
    '            <div class="swiper__nav">',
    '                <div class="swiper__nav_container">',
    SWIPER_NAV_BUTTON('btnp'),
    '                    <div class="swiper-paginationCust"></div>',
    SWIPER_NAV_BUTTON('btnn'),
    '                </div>',
    '            </div>',
    '        </div>',
  ].join('\n');
}

function images(list, name, wrap, manifest) {
  return (list || [])
    .map(({ src, alt }) => img(src, alt || name, false, manifest))
    .map((h) => wrap(`<div class="currentProject-heroImg">${h}</div>`))
    .join('');
}

const typeSet = (facts) => (facts || []).map((f) => '<div class="item">'
  + `<div class="item-name">${f.label}</div>`
  + `<div class="item-char">${f.value}</div></div>`).join('');

function body(name, p, manifest) {
  const img2 = images(p.image_2, name, (h) => (
    `<div class="currentProject_container">${h}</div>`), manifest);
  const last = images(p.last_images, name, (h) => h, manifest);
  const text3 = nonEmpty(p.text_3).length;
  return [
    swiper(p.slider_1, name, 'gallery11', manifest),
    texts(p.text_1, 'projText1'),
    img2 && `        <div class="curProjimg2">${img2}</div>`,
    texts(p.text_2, 'projText2'),
    swiper(p.slider_2, name, 'gallery22', manifest, text3 ? '' : ' curpadslide'),
    texts(p.text_3, 'projText3'),
    last && `        <div class="currentProject_container projLastImg">${last}</div>`,
  ].filter(Boolean).join('\n');
}

/* og:image: the hero. A video hero gives the first slide, else the card image. */
function ogImage(p) {
  const src = isVideo(p.hero) ? ((p.slider_1 || [])[0] || {}).src || p.card_image : p.hero;
  return src ? `  <meta property="og:image" content="${escAttr(DOMAIN + src)}">` : '';
}

function title(name, p) {
  const area = (p.area || p.region || '').trim();
  return area ? `${name} | ${area} | Nellis Architecture` : `${name} | Nellis Architecture`;
}

function schema(entry, pageTitle, desc) {
  const url = DOMAIN + entry.url;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: pageTitle,
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
          {
            '@type': 'ListItem', position: 2, name: 'Projects', item: `${DOMAIN}/projects/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: CATEGORIES[entry.cat].label,
            item: DOMAIN + categoryHref(entry.cat),
          },
          { '@type': 'ListItem', position: 4, name: entry.name },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');
}

function currentProject(entry, manifest, site, followHtml) {
  const { name, p } = entry;
  return fill(loadPartial('current-project'), {
    OPEN_CLASS: ' project__openned',
    BREADCRUMB: fill(loadPartial('project-breadcrumb'), {
      CATEGORY_HREF: escAttr(categoryHref(entry.cat)),
      CATEGORY_LABEL: escText(CATEGORIES[entry.cat].label),
      NAME: escText(name),
    }),
    NAME: escText(name),
    AREA: escText(p.area),
    REGION: escText(p.region),
    HERO: hero(p, name, manifest),
    CONTENT: body(name, p, manifest),
    TYPE_SET: typeSet(p.facts),
    FOLLOW: followHtml,
    ...emailTokens(site),
    YEAR: year(),
  });
}

/* Desktop: the thumbnail column starts at the open project (Zoya: at the column title). */
const SCROLL_TO_CURRENT = [
  '',
  '  <script>',
  "    if (matchMedia('(min-width: 1180px)').matches) {",
  "      var column = document.querySelector('.centerProject');",
  "      column.scrollTop = column.querySelector('[aria-current]').parentNode.offsetTop",
  "        - column.querySelector('.project__item').offsetTop;",
  '    }',
  '  </script>',
].join('\n');

/* SHORTCUT: data/filters/*.html keep the card sizes, so a filter click in this column loads a
   larger variant than needed. Upgrade: sizes="auto" when all browsers support it. */
function panel(entry, projects, manifest, site, followHtml) {
  const html = fill(loadPartial('index-projects'), {
    CENTER_CLASS: ' centerMini',
    PROJECT_COUNT: projects.length,
    GRID: grid(projects, { slot: 'thumb', current: entry.url, manifest }),
    FOLLOW: followHtml,
    ...emailTokens(site),
    YEAR: year(),
    CURRENT_PROJECT: currentProject(entry, manifest, site, followHtml),
  });
  return `${html}${SCROLL_TO_CURRENT}\n  <script src="/js/project-switch.js"></script>`;
}

/* entry: one item of loadProjects(). projects: the full list, for the grid. */
function render(entry, { site, projects, manifest = readManifest() }) {
  const { name, p } = entry;
  const followHtml = follow(site.follow);
  const seo = p.seo || {};
  const pageTitle = seo.title || title(name, p);
  const desc = seo.description || description((p.text_1 || [])[0]);
  const headHtml = head({
    BEFORE: '',
    PRELOAD: isVideo(p.hero) ? preloadLink(heroVideo(p.hero, manifest).href) : '',
    OG_IMAGE: ogImage(p),
    OG_TYPE: 'article',
    MODIFIED_TIME: '',
    SCHEMA: schema(entry, pageTitle, desc),
    ...seoTokens({ seo: { ...seo, title: pageTitle, description: desc } }, {
      slug: entry.url.slice(1, -1), source: `content/projects/${entry.filename}.json`,
    }),
  // Shortcut: the data has no dates, so drop the empty modified_time line.
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(name, site),
    fill(loadPartial('page-index'), {
      NAV: navSite(site.nav),
      AFFILIATIONS: affiliations(site.affiliations, '  '),
      ...emailTokens(site),
      PROJECT_COUNT: projects.length,
      PROJECTS: panel(entry, projects, manifest, site, followHtml),
    }),
    footer(site),
  ].join('\n');
}

module.exports = {
  render, title, ogImage, typeSet, texts,
};
