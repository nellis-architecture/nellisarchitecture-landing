const fs = require('node:fs');
const path = require('node:path');
const redirects = require('./redirects');
const service = require('./pages/service');
const { parseFrontMatter, markdownPage, SLUG } = require('./markdown');

/* Landing pages: content/landing/<filename>.md builds /<slug>/ at the repo root. The first
   line of each page is MARK: the build deletes only marked folders that no entry owns. */
const MARK = '<!-- landing -->\n';
const RESERVED = ['api', 'cdn-cgi', 'deployment-logs'];

function loadLanding(root) {
  const dir = path.join(root, 'content', 'landing');
  if (!fs.existsSync(dir)) return [];
  const seen = new Set();
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const source = `content/landing/${f}`;
    const { fm, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'), source);
    if (!SLUG.test(fm.slug || '')) {
      throw new Error(`${source}: slug must be lowercase letters, digits and dashes: "${fm.slug}"`);
    }
    if (seen.has(fm.slug)) throw new Error(`${source}: duplicate slug "${fm.slug}"`);
    seen.add(fm.slug);
    const data = markdownPage(fm, body);
    return {
      slug: fm.slug,
      filename: f.slice(0, -3),
      source,
      module: service,
      priority: '0.6',
      before: MARK,
      data: { ...data, title: data.title || data.h1 },
    };
  });
}

function isLanding(root, name) {
  const file = path.join(root, name, 'index.html');
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').startsWith(MARK);
}

/* The slug must not hit a root entry (x.html counts as x), a reserved name or a fixed rule. */
function checkLanding(root, pages) {
  if (!pages.length) return;
  const names = new Set(fs.readdirSync(root).map((n) => n.replace(/\.html$/, '')));
  const fixedText = fs.readFileSync(path.join(root, redirects.FIXED_FILE), 'utf8');
  const froms = redirects.fixedFroms(redirects.parseFixed(fixedText));
  pages.forEach(({ slug, source }) => {
    if (RESERVED.includes(slug) || (names.has(slug) && !isLanding(root, slug))) {
      throw new Error(`${source}: slug "${slug}" is a name that the site uses`);
    }
    const file = redirects.hitsFixed(`/${slug}/`, froms);
    if (file) throw new Error(`${source}: slug "${slug}" matches a rule in ${file}`);
  });
}

/* Run before writeRedirects: a stale folder would block the 301 of a changed slug. */
function pruneLanding(root, pages) {
  const slugs = new Set(pages.map((p) => p.slug));
  fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !slugs.has(d.name) && isLanding(root, d.name))
    .forEach((d) => {
      fs.rmSync(path.join(root, d.name), { recursive: true });
      console.log(`deleted stale ${d.name}/`);
    });
}

module.exports = {
  MARK, loadLanding, checkLanding, pruneLanding,
};
