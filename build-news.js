/*
 * build-news.js — regenerates news pages from content/news/*.md
 * Runs on Cloudflare Workers Builds after every push (npm run build, see infra/cloudflare.js).
 * Zero dependencies: plain Node 20+.
 *
 *   node build-news.js
 *
 * What it does:
 *   1. Reads every markdown file in content/news/
 *   2. Renders news/<slug>/index.html from build/news-template.html
 *   3. Rebuilds the NewsList sidebar on every news page (newest first)
 *   4. Builds index.html, studio/, people/, privacy/, news/, news/category/<slug>/, contact/ and
 *      projects/<category>/index.html from content/pages/*.json (build/lib/);
 *      their "News" link points at /news/
 *   5. Updates data/news.json (used by the in-page news switcher)
 *   6. Regenerates sitemap.xml
 *   7. Builds projects/<category>/<slug>/index.html from data/projects.json
 *   8. Deletes news/<dir>/ and projects/ folders that no post or project owns
 *   9. Writes _redirects from build/redirects.txt, content/redirects.json and changed news slugs
 *  10. Writes feed.xml (RSS 2.0, 10 newest posts; build/redirects.txt serves it at /feed/)
 *  11. Writes robots.txt from content/robots.json (plus the Sitemap line)
 *  First, on Workers Builds only: makes the image variants that build/images.json lacks
 *  (build/lib/images.js)
 */
const fs = require('node:fs');
const path = require('node:path');
const { readSite, writePages } = require('./build/lib/pages');
const { writePreview } = require('./build/lib/preview');
const {
  customSchema, pageUrl, DOMAIN, INDEX, LOGO, NOINDEX,
} = require('./build/lib/seo');
const redirects = require('./build/lib/redirects');
const { loadProjects, CATEGORY_KEYS } = require('./build/lib/projects');
const project = require('./build/lib/pages/project');
const { rss } = require('./build/lib/feed');
const { robots } = require('./build/lib/robots');
const { imageSize } = require('./build/lib/image-size');
const { escAttr, isVideo, loadPartial } = require('./build/lib/html');
const {
  follow, navPost, sitekey, emailTokens, year,
} = require('./build/lib/chrome');
const {
  heroPath, categoryHref, FALLBACK_SRC, NEWS_CATEGORIES,
} = require('./build/lib/pages/news');
const {
  ensureVariants, readManifest, picture, heroVideo, preloadLink,
} = require('./build/lib/images');

const ROOT = __dirname;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
/* A full month name or its 3-letter short form (Aug), plus Sept; any case. -1 if unknown. */
function monthIndex(name) {
  const lower = name.toLowerCase();
  if (MONTHS.includes(lower)) return MONTHS.indexOf(lower);
  if (lower === 'sept') return 8;
  return MONTHS.findIndex((m) => m.slice(0, 3) === lower);
}
const ARROW_SVG = '<svg width="15" height="9" viewBox="0 0 15 9" fill="none" '
  + 'xmlns="http://www.w3.org/2000/svg"><path d="M14.3536 4.85355C14.5488 4.65829 14.5488 '
  + '4.34171 14.3536 4.14645L11.1716 0.964466C10.9763 0.769204 10.6597 0.769204 10.4645 '
  + '0.964466C10.2692 1.15973 10.2692 1.47631 10.4645 1.67157L13.2929 4.5L10.4645 '
  + '7.32843C10.2692 7.52369 10.2692 7.84027 10.4645 8.03553C10.2692 8.2308 10.9763 '
  + '8.2308 11.1716 8.03553L14.3536 4.85355Z" fill="currentColor"/></svg>';

const FALLBACK_IMG = {
  url: `${DOMAIN}${FALLBACK_SRC}`,
  width: 968,
  height: 504,
  type: 'image/png',
};

/* ---------- tiny front-matter + markdown parser ---------- */
function parseFrontMatter(src, file = '') {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`bad front matter: ${file}`);
  const fm = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([a-z_]+):\s*("(?:[^"\\]|\\.)*"|.*)$/);
    if (kv) {
      let v = kv[2].trim();
      /* Block scalar (Decap writes `|-`, or `>-` past 80 chars). Only `schema` uses it, as
         JSON: `>` joins with a space, the blank lines drop, and the end is trimmed. */
      const block = v.match(/^([|>])[-+]?$/);
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
      if (block) {
        const rest = [];
        while (i + 1 < lines.length && /^(\s|$)/.test(lines[i + 1])) {
          i += 1;
          rest.push(lines[i]);
        }
        const indent = (rest.find((l) => l.trim()) || '').match(/^\s*/)[0].length;
        const text = rest.map((l) => l.slice(indent));
        v = (block[1] === '|' ? text.join('\n') : text.filter((l) => l.trim()).join(' ')).trimEnd();
      }
      fm[kv[1]] = v;
    }
  }
  return { fm, body: m[2].trim() };
}

/* manifest: build/images.json. The images go through picture(); the markdown keeps the
   original URLs. Finished markup (images, link start tags) waits as a \u0000n\u0000 token,
   so the later rules do not change its attributes. Link schemes other than http(s), mailto
   and tel lose the link and keep the text. */
const SAFE_HREF = /^(?:https?:|mailto:|tel:|[^:]*(?:[/?#]|$))/i;

/* eslint-disable no-control-regex -- NUL marks the tokens */
function inlineMd(s, manifest = {}) {
  const done = [];
  const keep = (html) => `\u0000${done.push(html) - 1}\u0000`;
  return s.replace(/\u0000/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => keep(picture({
      src, alt, slot: 'post',
    }, manifest)))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => (
      SAFE_HREF.test(href.replace(/[\u0000- ]/g, ''))
        ? `${keep(`<a href="${escAttr(href)}">`)}${text}</a>` : text))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u0000(\d+)\u0000/g, (m, i) => done[i]);
}
/* eslint-enable no-control-regex */

function blockToHtml(b, manifest) {
  if (/^#{2,4}\s/.test(b)) {
    const level = b.match(/^(#{2,4})/)[1].length;
    return `<h${level}>${inlineMd(b.replace(/^#{2,4}\s*/, ''), manifest)}</h${level}>\n`;
  }
  if (b === '---') return '<hr />\n';
  if (/^(- )/m.test(b)) {
    const items = b.split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => `<li>${inlineMd(l.slice(2), manifest)}</li>`)
      .join('');
    return `<ul>${items}</ul>\n`;
  }
  if (b.startsWith('> ')) {
    return `<blockquote>${inlineMd(b.replace(/^>\s?/gm, ''), manifest)}</blockquote>\n`;
  }
  const html = inlineMd(b, manifest);
  if (/^<(?:img|picture)\b/.test(html)) return `${html}\n`;
  return `<p>${inlineMd(b.replace(/\n/g, ' '), manifest)}</p>\n`;
}

function mdToHtml(md, manifest = {}) {
  return md.split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => blockToHtml(b, manifest))
    .join('')
    .trim();
}

function parseDate(s) {
  const m = (s || '').match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return new Date(0);
  const month = Math.max(monthIndex(m[1]), 0);
  return new Date(Date.UTC(+m[3], month, +m[2]));
}

function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function idNum(p) {
  const n = parseInt(p.id, 10);
  return Number.isNaN(n) ? 0 : n;
}

/* ---------- NewsList markup (matches original theme) ---------- */
function newsList(posts) {
  return posts.map((p) => `                  <div class="NewsListItem"
            style="cursor: pointer;"
            data-id="${p.id}"
            data-slug="${p.slug}"
            data-permalink="../${p.slug}/index.html">
            <div class="NewsListData">${p.date || ''}</div>
            <h3 class="NewsListTitle">
              ${p.title}            </h3>
          </div>`).join('\n');
}

function loadPosts(dir, manifest = {}) {
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const file = path.join(dir, f);
    const { fm, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'), file);
    if (!SLUG.test(fm.slug || '')) {
      throw new Error(`${file}: slug must be lowercase letters, digits and dashes: "${fm.slug}"`);
    }
    if (!['true', 'false', '', undefined].includes(fm.noindex)) {
      throw new Error(`${file}: noindex must be true or false: "${fm.noindex}"`);
    }
    if (!Object.hasOwn(NEWS_CATEGORIES, fm.category || '')) {
      const keys = Object.keys(NEWS_CATEGORIES).join(', ');
      throw new Error(`${file}: category must be one of ${keys}: "${fm.category}"`);
    }
    fm.noindex = fm.noindex === 'true';
    if (!fm.id) fm.id = `md${fm.slug}`;
    fm.filename = f.slice(0, -3);
    fm.html = mdToHtml(body, manifest);
    fm.dateObj = parseDate(fm.date);
    return fm;
  });
  return posts.sort((a, b) => (b.dateObj - a.dateObj) || (idNum(b) - idNum(a)));
}

function articleSchema(p, imageUrl) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: p.title,
        description: p.description || '',
        image: imageUrl,
        datePublished: p.dateObj.toISOString(),
        mainEntityOfPage: `${DOMAIN}/news/${p.slug}/`,
        author: { '@type': 'Organization', name: 'Nellis Architecture' },
        publisher: { '@type': 'Organization', name: 'Nellis Architecture', logo: LOGO },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem', position: 1, name: 'Home', item: `${DOMAIN}/`,
          },
          {
            '@type': 'ListItem', position: 2, name: 'News', item: `${DOMAIN}/news/`,
          },
          { '@type': 'ListItem', position: 3, name: p.title }],
      },
    ],
  });
}

/* og:image = the hero when it is a local JPEG/PNG; else the theme image. */
function ogImage(p) {
  const rel = heroPath(p);
  const size = rel && imageSize(path.join(ROOT, rel));
  return size ? { url: p.hero, ...size } : FALLBACK_IMG;
}

function readingTime(html) {
  const words = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const n = Math.max(1, Math.ceil(words / 200));
  return `${n} minute${n === 1 ? '' : 's'}`;
}

/* The post priority image. The switcher (data/news.json) shows the same markup. */
function heroPicture(p, manifest) {
  return picture({
    src: p.hero, alt: p.hero_alt || p.title, slot: 'post', priority: true,
  }, manifest);
}

function newsImg(p, manifest = {}) {
  if (!p.hero) return '<div class="NewsImg" style="display: none;">\n          </div>';
  const inner = isVideo(p.hero) ? heroVideo(p.hero, manifest).html : heroPicture(p, manifest);
  return `<div class="NewsImg">\n            ${inner}\n          </div>`;
}

const SITE_NAME = ' | Nellis Architecture';

/* WordPress titles often end with the site name already: do not add it twice. */
function seoTitle(p) {
  if (p.seo_title) return p.seo_title;
  return p.title.endsWith(SITE_NAME) ? p.title : `${p.title}${SITE_NAME}`;
}

function renderPost(template, p, list, manifest = {}, site = readSite(ROOT)) {
  const img = ogImage(p);
  const newsBtn = p.link
    ? `<a target="_blank" href="${p.link}" class="NewsBtn">MORE INFO ${ARROW_SVG}</a>`
    : '<a href="/" class="NewsBtn"></a>';

  return template
    .replaceAll('{{SEO_TITLE}}', esc(seoTitle(p)))
    .replaceAll('{{PRELOAD}}', p.hero && isVideo(p.hero)
      ? preloadLink(heroVideo(p.hero, manifest).href) : '')
    .replaceAll('{{ROBOTS}}', p.noindex ? NOINDEX : INDEX)
    .replaceAll('{{META_DESC}}', esc(p.description || ''))
    .replace(/\{\{SLUG\}\}/g, p.slug)
    .replaceAll('{{OG_TITLE}}', esc(p.seo_title || p.title))
    .replaceAll('{{OG_DESC}}', esc(p.description || ''))
    .replaceAll('{{PUB_TIME}}', p.dateObj.toISOString())
    .replaceAll('{{MOD_TIME}}', p.dateObj.toISOString())
    .replaceAll('{{OG_IMAGE}}', escAttr(img.url))
    .replaceAll('{{OG_IMAGE_WIDTH}}', img.width)
    .replaceAll('{{OG_IMAGE_HEIGHT}}', img.height)
    .replaceAll('{{OG_IMAGE_TYPE}}', img.type)
    .replaceAll('{{READ_TIME}}', readingTime(p.html))
    .replaceAll('{{SCHEMA}}', articleSchema(p, img.url))
    .replaceAll('{{NEWS_IMG}}', newsImg(p, manifest))
    .replaceAll('{{IMAGES_CSS}}', loadPartial('images-css'))
    .replaceAll('{{TITLE}}', p.title)
    .replaceAll('{{DATE}}', p.date || '')
    .replaceAll('{{CATEGORY_HREF}}', categoryHref(p.category))
    .replaceAll('{{CATEGORY}}', esc(NEWS_CATEGORIES[p.category].name))
    .replaceAll('{{CONTENT}}', `\n${p.html}\n        `)
    .replaceAll('{{NEWS_BTN}}', newsBtn)
    .replaceAll('{{NEWSLIST}}', list)
    .replaceAll('{{TURNSTILE_SITEKEY}}', sitekey())
    .replaceAll('{{NAV}}', () => navPost(site.nav))
    .replaceAll('{{FOLLOW}}', () => follow(site.follow))
    .replaceAll('{{SCHEMA_EXTRA}}', () => customSchema(p.schema, `content/news/${p.filename}.md`));
}

function fillSite(template, site) {
  return Object.entries({ ...emailTokens(site), YEAR: year() })
    .reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, () => value), template);
}

function newsJsonEntry(p, manifest) {
  return {
    success: true,
    data: {
      title: p.title,
      content: p.html,
      data: p.date || '',
      img: p.hero || '',
      imgalt: p.hero_alt || p.title,
      picture: p.hero && !isVideo(p.hero) ? heroPicture(p, manifest) : '',
      link: p.link || '',
      slug: p.slug,
      category: NEWS_CATEGORIES[p.category].name,
      category_href: categoryHref(p.category),
    },
  };
}

function sitemap(posts, pages, projects = []) {
  const urls = [
    ...pages.filter((p) => !p.noindex).map((p) => ({ loc: pageUrl(p.slug), pr: p.priority })),
    ...projects.map((e) => ({ loc: `${DOMAIN}${e.url}`, pr: '0.7' })),
    ...posts.filter((p) => !p.noindex).map((p) => ({
      loc: `${DOMAIN}/news/${p.slug}/`, pr: '0.6', lastmod: p.dateObj.toISOString().slice(0, 10),
    })),
  ];
  const rows = urls.map((u) => {
    const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
    return `  <url><loc>${u.loc}</loc>${lastmod}<priority>${u.pr}</priority></url>`;
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + `${rows.join('\n')}\n</urlset>\n`;
}

/* Only folders directly inside news/ are deleted. news/category/ holds the category pages. */
function pruneNews(root, posts) {
  const newsRoot = path.join(root, 'news');
  const slugs = new Set(posts.map((p) => p.slug));
  fs.readdirSync(newsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !slugs.has(d.name) && d.name !== 'category')
    .forEach((d) => {
      fs.rmSync(path.join(newsRoot, d.name), { recursive: true });
      console.log(`deleted stale news/${d.name}/`);
    });
}

/* Refresh the NewsList inside every news/<dir>/index.html (incl. untouched ones).
   news/index.html (the /news/ page) has no NewsList and stays as it is. */
function refreshNewsLists(root, list) {
  const newsRoot = path.join(root, 'news');
  fs.readdirSync(newsRoot)
    .map((d) => path.join(newsRoot, d, 'index.html'))
    .filter((f) => fs.existsSync(f))
    .forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      const i = src.indexOf('<div class="NewsList">');
      const j = src.indexOf('<div class="elscroll"></div>', i);
      if (i > -1 && j > i) {
        const head = `${src.slice(0, i)}<div class="NewsList">\n`;
        fs.writeFileSync(f, `${head}${list}\n                ${src.slice(j)}`);
      }
    });
}

/* Only folders inside projects/ are deleted. Category folders always stay
   (they hold the category page, card PKvQRDwy); files are never deleted. */
function pruneProjects(root, list) {
  const projRoot = path.join(root, 'projects');
  const keep = new Set(list.map((e) => path.join(e.cat, e.slug)));
  const dirs = (rel) => fs.readdirSync(path.join(projRoot, rel), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(rel, d.name));
  const remove = (rel) => {
    fs.rmSync(path.join(projRoot, rel), { recursive: true });
    console.log(`deleted stale projects/${rel}/`);
  };
  dirs('').forEach((cat) => {
    if (!CATEGORY_KEYS.includes(cat)) remove(cat);
    else dirs(cat).filter((d) => !keep.has(d)).forEach(remove);
  });
}

function writeProjects(root, list, newsHref, manifest, site) {
  list.forEach((e) => {
    const outDir = path.join(root, e.url);
    fs.mkdirSync(outDir, { recursive: true });
    const html = project.render(e, { site, newsHref, manifest });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });
  pruneProjects(root, list);
}

/* Run after every page write: the checks read the final tree. */
function writeRedirects(root, posts) {
  const exists = redirects.onDisk(root);
  const json = fs.readFileSync(path.join(root, 'content', 'redirects.json'), 'utf8');
  const manual = redirects.parseRules(json);
  const rules = redirects.mergeRules(manual, redirects.autoNewsRules(posts), exists);
  const fixedText = fs.readFileSync(path.join(root, redirects.FIXED_FILE), 'utf8');
  const fixed = redirects.parseFixed(fixedText);
  const fixedFroms = redirects.fixedFroms(fixed);
  const errors = redirects.validate(rules, { exists, fixedFroms });
  if (errors.length) throw new Error(`content/redirects.json:\n${errors.join('\n')}`);
  fs.writeFileSync(path.join(root, '_redirects'), redirects.render(rules, fixed));
  return rules;
}

/* manifest: build/images.json, plus the variants that CI made (ensureVariants). */
function build(manifest = readManifest(ROOT)) {
  const posts = loadPosts(path.join(ROOT, 'content', 'news'), manifest);
  if (!posts.length) {
    console.log('no posts');
    return;
  }
  const list = newsList(posts);
  const site = readSite(ROOT);

  /* ---------- per-post page ---------- */
  const raw = fs.readFileSync(path.join(ROOT, 'build', 'news-template.html'), 'utf8');
  const template = fillSite(raw, site);
  const newsJson = {};
  posts.forEach((p) => {
    const outDir = path.join(ROOT, 'news', p.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'index.html'),
      renderPost(template, p, list, manifest, site),
    );
    newsJson[p.id] = newsJsonEntry(p, manifest);
  });

  pruneNews(ROOT, posts);

  refreshNewsLists(ROOT, list);

  const newest = posts[0];
  const newsHref = '/news/';
  const projects = loadProjects(ROOT);
  const pages = writePages(ROOT, newsHref, projects, posts, manifest);
  writeProjects(ROOT, projects, newsHref, manifest, site);
  writePreview(ROOT, manifest, newsHref);

  fs.writeFileSync(path.join(ROOT, 'data', 'news.json'), JSON.stringify(newsJson, null, 2));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap(posts, pages, projects));
  fs.writeFileSync(path.join(ROOT, 'feed.xml'), rss(posts));
  const robotsJson = fs.readFileSync(path.join(ROOT, 'content', 'robots.json'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots(JSON.parse(robotsJson).rules));
  const rules = writeRedirects(ROOT, posts);

  console.log(`built ${posts.length} news pages; newest: ${newest.slug}; `
    + `${projects.length} project pages; ${rules.length} redirects`);
}

if (require.main === module) ensureVariants(ROOT).then((manifest) => build(manifest));

module.exports = {
  parseFrontMatter,
  inlineMd,
  mdToHtml,
  parseDate,
  monthIndex,
  esc,
  idNum,
  sitemap,
  loadPosts,
  articleSchema,
  renderPost,
  fillSite,
  newsImg,
  newsJsonEntry,
  newsList,
  readingTime,
  pruneNews,
  refreshNewsLists,
  pruneProjects,
  writeRedirects,
};
