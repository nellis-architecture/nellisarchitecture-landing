const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadLanding } = require('../build/lib/landing');

const FIXED = [
  'admin', 'contact', 'data', 'js', 'news', 'people', 'privacy', 'projects', 'studio', 'wp-content',
  'robots.txt', 'sitemap.xml', 'feed.xml', '_redirects', '_headers',
];
const root = path.join(__dirname, '..');
const SITE = [...FIXED, ...loadLanding(root).map((p) => p.slug)];
const isPublic = (entry, site = SITE) => entry.endsWith('.html') || site.includes(entry);

const ignores = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const ignored = (entry, isDir) => ignores.some((line) => {
  if (line.endsWith('/')) return isDir && line === `/${entry}/`;
  return line === `/${entry}` || line === entry;
});
// Wrangler stats each entry: a symlink to a folder counts as a folder, a broken link as a file.
const entryOf = (dir, name) => {
  try {
    return { name, isDir: fs.statSync(path.join(dir, name)).isDirectory() };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { name, isDir: false };
  }
};
const disk = fs.readdirSync(root).map((name) => entryOf(root, name));

test('every internal root entry on disk is in .assetsignore', () => {
  disk.filter(({ name }) => !isPublic(name)).forEach(({ name, isDir }) => {
    assert.ok(ignored(name, isDir), `.assetsignore: missing /${name}${isDir ? '/' : ''}`);
  });
});

test('no public root entry is in .assetsignore', () => {
  disk.filter(({ name }) => isPublic(name)).forEach(({ name, isDir }) => {
    assert.ok(!ignored(name, isDir), `.assetsignore: public entry "${name}" is ignored`);
  });
  SITE.forEach((entry) => {
    const hit = ignored(entry, true) || ignored(entry, false);
    assert.ok(!hit, `.assetsignore: "${entry}" is ignored`);
  });
});

test('a landing slug is public, a stale landing folder is not', () => {
  const site = [...FIXED, 'dubai-villas'];
  assert.ok(isPublic('dubai-villas', site));
  assert.ok(!isPublic('old-villas', site));
  assert.ok(!ignored('old-villas', true));
});

test('a symlink to a folder counts as a folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assetsignore-'));
  fs.mkdirSync(path.join(dir, 'real'));
  fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'link'));
  fs.writeFileSync(path.join(dir, 'file'), '');
  try {
    assert.deepEqual(['real', 'link', 'file'].map((n) => entryOf(dir, n)), [
      { name: 'real', isDir: true },
      { name: 'link', isDir: true },
      { name: 'file', isDir: false },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('each .assetsignore line is an exact root entry: /name, /name/ or .DS_Store', () => {
  ignores.forEach((line) => {
    const exact = /^(\/[^/*?![\]]+\/?|\.DS_Store)$/;
    assert.match(line, exact, `.assetsignore: "${line}" is not an exact root entry`);
  });
});

test('.assetsignore lists .DS_Store unanchored', () => {
  assert.ok(ignores.includes('.DS_Store'));
});

test('wrangler is pinned to one exact version in devDependencies and the deploy script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.devDependencies.wrangler;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(pkg.scripts.deploy.includes(`wrangler@${version}`), `deploy: wrangler@${version}`);
});

test('.assetsignore and .gitignore list deployment-logs/', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
  assert.ok(ignores.includes('/deployment-logs/'));
  assert.ok(gitignore.includes('deployment-logs/'));
});

test('.assetsignore and .gitignore list /.dev.vars', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
  assert.ok(ignores.includes('/.dev.vars'));
  assert.ok(gitignore.includes('/.dev.vars'));
});
