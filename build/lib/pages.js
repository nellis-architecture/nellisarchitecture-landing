const fs = require('node:fs');
const path = require('node:path');
// eslint-disable-next-line import-x/no-useless-path-segments -- Home page module
const index = require('./pages/index');
const privacy = require('./pages/privacy');
const studio = require('./pages/studio');
const people = require('./pages/people');
const category = require('./pages/category');
const news = require('./pages/news');
const contact = require('./pages/contact');
const { CATEGORY_KEYS, loadProjects } = require('./projects');
const { readManifest } = require('./images');

/* slug is fixed in code: the page URL is /<slug>/ (Home: /). */
const PAGES = [
  {
    slug: '', content: 'index', module: index, priority: '1.0',
  },
  {
    slug: 'studio', content: 'studio', module: studio, priority: '0.8',
  },
  {
    slug: 'people', content: 'people', module: people, priority: '0.8',
  },
  {
    slug: 'privacy', content: 'privacy', module: privacy, priority: '0.2',
  },
  {
    slug: 'projects', content: 'projects', module: category, priority: '0.7', category: 'all',
  },
  {
    slug: 'news', content: 'news', module: news, priority: '0.7',
  },
  {
    slug: 'contact', content: 'contact', module: contact, priority: '0.5',
  },
  ...CATEGORY_KEYS.map((cat) => ({
    slug: `projects/${cat}`,
    content: `projects-${cat}`,
    module: category,
    priority: '0.7',
    category: cat,
  })),
];

const pageFile = (slug) => (slug ? `${slug}/index.html` : 'index.html');

function readContent(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'content', 'pages', `${name}.json`), 'utf8'));
}

const isPath = (p) => typeof p === 'string' && /^\/[^\s]*$/.test(p) && !p.includes('..');
const isUrl = (p) => typeof p === 'string' && /^https?:\/\/[^\s]+$/.test(p);

function validateSite(site) {
  const errors = [];
  ['nav', 'follow'].forEach((key) => {
    const list = site[key];
    if (!Array.isArray(list) || !list.length) {
      errors.push(`${key}: expected a non-empty array`);
      return;
    }
    list.forEach((item, i) => {
      const name = `${key}[${i}]`;
      const fail = (why) => errors.push(`${name}: ${why}`);
      if (typeof item !== 'object' || item === null) {
        fail('expected an object with "label" and "link"');
        return;
      }
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      const link = typeof item.link === 'string' ? item.link.trim() : '';
      if (!label) fail('"label" is empty');
      if (!link) fail('"link" is empty');
      else if (!isPath(link) && !isUrl(link)) fail('"link" must start with / or http(s)://');
    });
  });
  return errors;
}

function readSite(root) {
  const site = readContent(root, 'site');
  const errors = validateSite(site);
  if (errors.length) throw new Error(`content/pages/site.json:\n${errors.join('\n')}`);
  return site;
}

/* Each result also carries what the sitemap needs: slug, priority, noindex.
   projects: loadProjects() result, read once by the build. posts: loadPosts() result.
   manifest: build/images.json (the build passes it with the variants that CI made).
   Shortcut: without posts (unit tests) the /news/ page is left out.
   Upgrade: load the posts here once loadPosts moves to build/lib/. */
function renderPages(
  root,
  newsHref,
  projects = loadProjects(root),
  posts = null,
  manifest = readManifest(root),
) {
  const site = readSite(root);
  return PAGES.filter((p) => posts || p.module !== news).map((p) => {
    const content = readContent(root, p.content);
    return {
      file: pageFile(p.slug),
      html: p.module.render(content, {
        site, newsHref, page: p, root, projects, posts, manifest,
      }),
      slug: p.slug,
      priority: p.priority,
      noindex: Boolean(content.seo && content.seo.noindex),
    };
  });
}

function writePages(root, newsHref, projects, posts, manifest) {
  const pages = renderPages(root, newsHref, projects, posts, manifest);
  pages.forEach((p) => {
    fs.mkdirSync(path.dirname(path.join(root, p.file)), { recursive: true });
    fs.writeFileSync(path.join(root, p.file), p.html);
  });
  return pages;
}

module.exports = {
  PAGES, renderPages, writePages, readSite, validateSite,
};
