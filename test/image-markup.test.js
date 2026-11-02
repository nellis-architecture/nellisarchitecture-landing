const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  walk, readManifest, toUploadPath, SLOTS, posterOf,
} = require('../build/lib/images');
const { isVideo } = require('../build/lib/html');
const { loadProjects } = require('../build/lib/projects');
const { filterFiles, searchJson } = require('../build/lib/pages/grid');
const { loadPosts } = require('../build-news');

const ROOT = path.join(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const PAGES = ['index.html', 'studio/index.html', 'people/index.html',
  ...walk(path.join(ROOT, 'projects')).map(rel).filter((f) => f.endsWith('index.html'))];
const NEWS = walk(path.join(ROOT, 'news')).map(rel).filter((f) => f.endsWith('index.html'));
const FILTERS = walk(path.join(ROOT, 'data', 'filters')).map(rel);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pages', 'site.json'), 'utf8'));
const CHROME = new Set(['/wp-content/uploads/2025/02/logo.png',
  ...site.affiliations.map((a) => a.src)]);
const MEDIA = /^\/wp-content\/(uploads|variants)\//;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

test('every content image has srcset, sizes, width and height, or is the sized fallback', () => {
  [...PAGES, ...NEWS, ...FILTERS].forEach((file) => {
    (read(file).match(/<img\b[^>]*>/g) || []).forEach((tag) => {
      if (/\blazyload\b/.test(attr(tag, 'class') || '')) {
        const src = attr(tag, 'data-src').replace(/^(\.\.\/)+/, '/');
        assert.ok(CHROME.has(src), `${file}: lazyload content image ${tag}`);
        return;
      }
      const src = attr(tag, 'src') || '';
      if (!MEDIA.test(src)) return;
      assert.ok(attr(tag, 'width') && attr(tag, 'height'), `${file}: no size ${tag}`);
      assert.equal(attr(tag, 'data-overlay-added'), 'true', `${file}: ${tag}`);
      if (src.startsWith('/wp-content/variants/')) {
        assert.ok(attr(tag, 'srcset') && attr(tag, 'sizes'), `${file}: ${tag}`);
        return;
      }
      const { size } = fs.statSync(path.join(ROOT, toUploadPath(src)));
      assert.ok(size <= 1024 * 1024, `${file}: original over 1 MB ${src}`);
    });
  });
});

test('each page has one priority image or poster preload; the filter files none', () => {
  PAGES.forEach((file) => {
    const html = read(file);
    const video = html.includes('<div class="currentProject-heroImg"><video');
    assert.equal(html.split('fetchpriority="high"').length - 1, 1, file);
    assert.equal(html.split('rel="preload"').length - 1, video ? 1 : 0, file);
    assert.equal(html.split('loading="eager"').length - 1, video ? 0 : 1, file);
  });
  FILTERS.forEach((file) => assert.ok(!read(file).includes('fetchpriority'), file));
});

test('the project page priority image is the hero, not a grid thumb', () => {
  PAGES.filter((f) => f.split('/').length === 5).forEach((file) => {
    const hero = read(file).split('<div class="currentProject-heroImg varVideo">')[1];
    if (hero) assert.match(hero.split('</div>')[0], /fetchpriority="high"/, file);
  });
});

test('data/filters and data/search.json are current: npm run build changes nothing', () => {
  const manifest = readManifest(ROOT);
  const list = loadProjects(ROOT);
  const files = filterFiles(list, manifest);
  assert.deepEqual(FILTERS.map((f) => path.basename(f, '.html')).sort(), Object.keys(files).sort());
  Object.entries(files).forEach(([name, text]) => {
    assert.equal(read(`data/filters/${name}.html`), text, name);
  });
  assert.equal(read('data/search.json'), searchJson(list, manifest));
});

test('project page grids use the thumb sizes, not the card sizes', () => {
  const pages = walk(path.join(ROOT, 'projects')).map(rel)
    .filter((f) => f.split('/').length === 4 && f.endsWith('index.html'));
  assert.ok(pages.length > 0);
  const esc = (s) => s.replaceAll('"', '&quot;');
  pages.forEach((f) => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const grid = html.slice(html.indexOf('centerMini'));
    assert.ok(grid.includes(`sizes="${esc(SLOTS.thumb)}"`), f);
    assert.ok(!grid.includes(`sizes="${esc(SLOTS.card)}"`), f);
  });
});

/* CLS: an inline-block picture is 0 px wide until its lazy image loads. width 100% and a
   max-width of the file width give it the final box, min(container, file width), at once. */
test('each picture has its final box before the image loads', () => {
  const css = read('build/lib/partials/images-css.html');
  const rule = css.match(/\bpicture \{([^}]*)\}/)[1];
  assert.match(rule, /display: inline-block;/);
  assert.match(rule, /\bwidth: 100%;/);
  [...PAGES, ...NEWS, ...FILTERS, 'data/news.json'].forEach((file) => {
    const text = read(file).replace(/\\"/g, '"').replace(/\\\//g, '/');
    (text.match(/<picture\b[^>]*>[\s\S]*?<img\b[^>]*>/g) || []).forEach((tag) => {
      const img = tag.match(/<img\b[^>]*>/)[0];
      const width = attr(img, 'width');
      assert.ok(width && attr(img, 'height'), `${file}: no size ${img}`);
      assert.match(tag, new RegExp(`^<picture style="max-width:${width}px[;"]`), `${file}: ${tag}`);
    });
  });
});

const AYLA = 'projects/architecture/ayla/index.html';
const ANNIVERSARY = 'news/one-year-anniversary-at-nellis-architecture-a-journey-of-vision-craft-'
  + 'and-growth/index.html';
const POSTER = /^\/wp-content\/variants\/2025\/07\/[\w-]+-poster-[0-9a-f]{8}-1600\.jpg$/;

test('a video hero page shows the poster at its size and preloads the same URL', () => {
  [AYLA, ANNIVERSARY].forEach((file) => {
    const html = read(file);
    const video = html.match(/<video\b[^>]*>/)[0];
    const poster = attr(video, 'poster');
    assert.match(poster, POSTER, file);
    assert.equal(attr(video, 'width'), '1920', file);
    assert.equal(attr(video, 'height'), '1080', file);
    assert.match(video, /^<video autoplay muted loop playsinline /, file);
    assert.doesNotMatch(video, /preload=/, file);
    const head = html.split('</head>')[0];
    const link = `<link rel="preload" as="image" href="${poster}" fetchpriority="high">`;
    assert.ok(head.includes(link), file);
  });
});

test('an image hero page and an image hero post have no preload', () => {
  const imageHero = (f) => !read(f).includes('<video');
  const pages = [...PAGES, ...NEWS].filter(imageHero);
  assert.ok(pages.includes('projects/architecture/zoya/index.html'));
  pages.forEach((file) => assert.ok(!read(file).includes('rel="preload"'), file));
});

test('every video hero has a poster file and a manifest entry: run ffmpeg, npm run images', () => {
  const manifest = readManifest(ROOT);
  const heroes = [
    ...loadProjects(ROOT).map((e) => e.p.hero),
    ...loadPosts(path.join(ROOT, 'content', 'news')).map((p) => p.hero),
  ].filter((src) => src && isVideo(src));
  assert.ok(heroes.length >= 2);
  heroes.forEach((src) => {
    const poster = posterOf(src);
    assert.ok(poster, `${src}: no <name>-poster.jpg`);
    assert.ok(manifest[poster], `${poster}: no manifest entry`);
  });
});

test('every upload and variant file name is ASCII (LND-106)', () => {
  const files = ['uploads', 'variants']
    .flatMap((dir) => walk(path.join(ROOT, 'wp-content', dir))).map(rel);
  assert.ok(files.length > 100);
  assert.deepEqual(files.filter((f) => /[^\x20-\x7e]/.test(f)), []);
});
