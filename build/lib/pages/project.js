const {
  escText, escAttr, fill, loadPartial, isVideo,
} = require('../html');
const {
  head, top, affiliations, footer, emailTokens, year,
} = require('../chrome');
const { DOMAIN, INDEX } = require('../seo');
const { CATEGORIES, categoryHref, description } = require('../projects');
const {
  picture, zoomSrc, readManifest, SLOTS, heroVideo, preloadLink,
} = require('../images');

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
function hero(src, name, manifest) {
  if (isVideo(src)) {
    return `${' '.repeat(8)}<div class="currentProject-heroImg">`
      + `${heroVideo(src, manifest).html}</div>`;
  }
  return `${' '.repeat(8)}<div class="currentProject-heroImg varVideo">`
    + `${img(src, name, true, manifest)}</div>`;
}

/* The <a> is the Fancybox trigger: data-src gives it the largest variant. */
function swiper(list, name, gallery, manifest, extra = '') {
  if (!nonEmpty(list).length) return '';
  const slides = nonEmpty(list).map((src) => `<a class="swiper-slide" href="${escAttr(src)}" `
    + `data-fancybox="${gallery}" data-src="${escAttr(zoomSrc(src, manifest))}">`
    + `${picture({ src, alt: name, slot: 'slide' }, manifest)}</a>`);
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
  return nonEmpty(list)
    .map((src) => img(src, name, false, manifest))
    .map((h) => wrap(`<div class="currentProject-heroImg">${h}</div>`))
    .join('');
}

/* label/value pairs; an odd last entry is dropped, as in the overlay. */
function typeSet(list) {
  const set = list || [];
  const items = [];
  for (let i = 0; i < Math.floor(set.length / 2); i += 1) {
    items.push(`<div class="item"><div class="item-name">${set[i * 2]}</div>`
      + `<div class="item-char">${set[i * 2 + 1]}</div></div>`);
  }
  return items.join('');
}

function body(name, p, manifest) {
  const img2 = images(p.project_img2, name, (h) => (
    `<div class="currentProject_container">${h}</div>`), manifest);
  const last = images(p.project_last_img, name, (h) => h, manifest);
  const text3 = nonEmpty(p.project_text_3).length;
  return [
    swiper(p.project_slider1, name, 'gallery11', manifest),
    texts(p.project_text_1, 'projText1'),
    img2 && `        <div class="curProjimg2">${img2}</div>`,
    texts(p.project_text_2, 'projText2'),
    swiper(p.project_slider2, name, 'gallery22', manifest, text3 ? '' : ' curpadslide'),
    texts(p.project_text_3, 'projText3'),
    last && `        <div class="currentProject_container projLastImg">${last}</div>`,
  ].filter(Boolean).join('\n');
}

/* og:image: the hero, or the first slide when the hero is a video. */
function ogImage(p) {
  const src = isVideo(p.first_img_video) ? (p.project_slider1 || [])[0] : p.first_img_video;
  return src ? `  <meta property="og:image" content="${escAttr(DOMAIN + src)}">` : '';
}

function title(name, p) {
  const area = (p.project_rigth1 || p.project_rigth2 || '').trim();
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

function currentProject(entry, manifest, site) {
  const { name, p } = entry;
  const { CONTACT_EMAIL_HREF, CONTACT_EMAIL } = emailTokens(site);
  return fill(loadPartial('current-project'), {
    OPEN_CLASS: ' project__openned',
    BREADCRUMB: fill(loadPartial('project-breadcrumb'), {
      CATEGORY_HREF: escAttr(categoryHref(entry.cat)),
      CATEGORY_LABEL: escText(CATEGORIES[entry.cat].label),
      NAME: escText(name),
    }),
    NAME: escText(name),
    AREA: escText(p.project_rigth1),
    REGION: escText(p.project_rigth2),
    HERO: hero(p.first_img_video, name, manifest),
    CONTENT: body(name, p, manifest),
    TYPE_SET: typeSet(p.project_type_set),
    CONTACT_EMAIL_HREF,
    CONTACT_EMAIL,
    YEAR: year(),
  });
}

/* Shortcut: the Home grid is static theme markup, so mark the open project by string edits.
   Ceiling: the markup of a grid item must stay as in index-projects.html.
   Upgrade: render the grid from data/projects.json. */
const GRID_ITEM = /<div class="project__item">[\s\S]*?<div class="projectPL">/g;

function gridItem(html, url) {
  const link = `<a class="project__link no-prefetch" href="${url}"`;
  if (!html.includes(link)) {
    return html.replace('class="project__item"', 'class="project__item zeroOpac"');
  }
  return html.replace(link, `${link} aria-current="page"`)
    .replace('class="projectPL"', 'class="projectPL PLoppened"');
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

/* The grid in the narrow column: the thumb sizes (the hand-kept partial has the card sizes).
   SHORTCUT: data/filters/*.html keep the card sizes, so a filter click in this column loads a
   larger variant than needed. Upgrade: sizes="auto" when all browsers support it. */
function projects(entry, manifest, site) {
  const grid = loadPartial('index-projects')
    .replaceAll(`sizes="${escAttr(SLOTS.card)}"`, `sizes="${escAttr(SLOTS.thumb)}"`);
  const html = fill(grid, {
    CENTER_CLASS: ' centerMini',
    ...emailTokens(site),
    YEAR: year(),
    CURRENT_PROJECT: currentProject(entry, manifest, site),
  }).replace(GRID_ITEM, (m) => gridItem(m, entry.url));
  if (html.split(`href="${entry.url}" aria-current="page"`).length !== 2) {
    throw new Error(`${entry.name}: the Home grid must link ${entry.url} exactly once`);
  }
  return `${html}${SCROLL_TO_CURRENT}\n  <script src="/js/project-switch.js"></script>`;
}

/* entry: one item of projectList(). */
function render(entry, { site, newsHref, manifest = readManifest() }) {
  const { name, p } = entry;
  const pageTitle = title(name, p);
  const desc = description((p.project_text_1 || [])[0]);
  const url = DOMAIN + entry.url;
  const headHtml = head({
    BEFORE: '',
    PRELOAD: isVideo(p.first_img_video)
      ? preloadLink(heroVideo(p.first_img_video, manifest).href) : '',
    OG_IMAGE: ogImage(p),
    TITLE: escText(pageTitle),
    ROBOTS: INDEX,
    DESCRIPTION: escAttr(desc),
    CANONICAL: escAttr(url),
    OG_TYPE: 'article',
    OG_TITLE: escAttr(pageTitle),
    OG_DESCRIPTION: escAttr(desc),
    OG_URL: escAttr(url),
    MODIFIED_TIME: '',
    SCHEMA: schema(entry, pageTitle, desc),
  // Shortcut: the data has no dates, so drop the empty modified_time line.
  // Upgrade: a head token for the whole line.
  }).replace('\t<meta property="article:modified_time" content="" />\n', '');
  return [
    headHtml,
    top(name, site),
    fill(loadPartial('page-index'), {
      NEWS_HREF: escAttr(newsHref),
      AFFILIATIONS: affiliations(site.affiliations, '  '),
      ...emailTokens(site),
      PROJECTS: projects(entry, manifest, site),
    }),
    footer(site),
  ].join('\n');
}

module.exports = {
  render, title, ogImage, typeSet, texts, gridItem,
};
