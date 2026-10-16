const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { escAttr, titleAttr } = require('./html');
const { imageSize } = require('./image-size');
const { decodeEntities } = require('./projects');

const MANIFEST = 'build/images.json';
const UPLOADS = 'wp-content/uploads/';
const VARIANTS = 'wp-content/variants/';
const THEME = 'wp-content/themes/';
const AVIF = [320, 640, 960, 1600, 2400];
const FALLBACK = [640, 1600, 2400];
const FORMATS = {
  avif: ['avif', { quality: 50, effort: 4 }],
  jpg: ['jpeg', { quality: 78, progressive: true, mozjpeg: true }],
  png: ['png', { compressionLevel: 9 }],
};
const SOURCES = [
  'build/lib/partials', 'build/news-template.html', 'data/filters', 'data/projects.json',
  'data/search.json', 'content/news', 'content/pages',
];
const PAGES = ['index.html', 'projects', 'news', 'studio', 'people', 'privacy', 'contact'];
const DOMAIN = '(?:https://nellisarchitecture\\.com)?/?';
const REF = new RegExp(
  `${DOMAIN}wp-content/uploads/[^"'\\s()<>,\\\\]+?\\.(?:jpe?g|png|webp)(?![\\w.-])`,
  'gi',
);
const MP4 = new RegExp(
  `${DOMAIN}wp-content/uploads/[^"'\\s()<>,\\\\]+?\\.mp4(?![\\w.-])`,
  'gi',
);
const VREF = new RegExp(
  `${DOMAIN}wp-content/variants/[^"'\\s()<>,\\\\]+?-[0-9a-f]{8}-\\d+\\.(?:avif|jpg|png)`,
  'g',
);
const UPLOAD = new RegExp(`^${DOMAIN}(wp-content/uploads/[^?#]+)`);
const VARIANT = /-[0-9a-f]{8}-\d+\.(?:avif|jpg|png)$/;
const VARIANT_NAME = /^wp-content\/variants\/(.+)-([0-9a-f]{8})-\d+\.\w+$/;
const VARIANT_URL = new RegExp(`^${DOMAIN}(wp-content/variants/[^?#]+)`);
const ROOT = path.join(__dirname, '..', '..');
const HAND_KEPT = ['build/lib/partials/index-projects.html', 'data/filters'];
const SEARCH = 'data/search.json';

/* sizes per slot: the rendered image width at each theme breakpoint (759, 980, 1179, 1439,
   1919 px) of wp-content/themes/nellis/assets/scss/main.css, measured in headless Chromium
   on both sides of each breakpoint (card BmeugdDp).
   card: .project__item-img on Home and the category pages. thumb: the same grid in the
   .centerMini column of a project page. full: .currentProject-heroImg and .curProjimg2.
   wide: .FirstBlock__BigImg (studio, people). slide: .swiper-slide. portrait: the studio
   .photo1 and .FourBlock__firstPhoto. person: the open .accord__itemImg (people).
   post: the .NewsImg hero and the .NewsContent images of a news post (the news theme also
   breaks at 1700 px). teaser: the .newsIndexImg cards of /news/ (page-news.html: 320 px).
   Measured in headless Brave (card 9qVdi6pv). */
const SLOTS = {
  card: '(max-width: 980px) calc(100vw - 32px), (max-width: 1179px) calc(100vw - 262px), '
    + '(max-width: 1439px) calc(100vw - 331px), (max-width: 1919px) calc(100vw - 401px), '
    + 'calc(100vw - 447px)',
  thumb: '(max-width: 980px) calc(100vw - 32px), (max-width: 1179px) calc(100vw - 262px), '
    + '(max-width: 1439px) calc(100vw - 1050px), (max-width: 1919px) calc(33vw - 320px), '
    + 'calc(100vw - 1644px)',
  full: '(max-width: 980px) calc(100vw - 30px), (max-width: 1179px) calc(100vw - 260px), '
    + '(max-width: 1439px) 767px, (max-width: 1919px) calc(67vw - 33px), 1225px',
  wide: '(max-width: 759px) calc(100vw - 32px), (max-width: 980px) calc(100vw - 40px), '
    + '(max-width: 1439px) calc(100vw - 270px), (max-width: 1919px) calc(100vw - 380px), '
    + 'calc(100vw - 456px)',
  slide: '(max-width: 759px) 46vw, (max-width: 1439px) 400px, (max-width: 1919px) 427px, 582px',
  portrait: '(max-width: 759px) calc(100vw - 32px), (max-width: 1179px) 520px, '
    + '(max-width: 1439px) 570px, (max-width: 1919px) 600px, 1020px',
  person: '(max-width: 759px) 30vw, (max-width: 980px) 20vw, (max-width: 1179px) 270px, '
    + '(max-width: 1699px) 330px, 1000px',
  post: '(max-width: 759px) calc(100vw - 32px), (max-width: 980px) calc(100vw - 272px), '
    + '(max-width: 1439px) calc(100vw - 502px), (max-width: 1700px) calc(100vw - 726px), '
    + '(max-width: 1919px) calc(100vw - 836px), calc(100vw - 902px)',
  teaser: '(max-width: 759px) calc(100vw - 32px), 320px',
};
const LAZY = ' loading="lazy"';
const PRIORITY = ' loading="eager" fetchpriority="high"';

/* A clean relative posix path below base: no ".", "..", "//" or a backslash. */
const inside = (p, base) => !p.includes('\\') && path.posix.normalize(p) === p
  && p.startsWith(base);

/* Steps below the original width, then the original width once (never upscale). */
function ladder(width, steps = AVIF) {
  const below = steps.filter((s) => s < width);
  return width > steps[steps.length - 1] ? below : [...below, width];
}

function variantName(uploadPath, hash, w, ext) {
  const rel = uploadPath.slice(UPLOADS.length);
  const dir = path.posix.dirname(rel);
  const name = path.posix.basename(rel, path.posix.extname(rel));
  const out = `${VARIANTS}${dir === '.' ? '' : `${dir}/`}${name}-${hash}-${w}.${ext}`;
  if (!inside(out, VARIANTS)) throw new Error(`variant outside ${VARIANTS}: ${out}`);
  return out;
}

/* An upload URL or path -> "wp-content/uploads/...", else null. */
function toUploadPath(url) {
  const m = String(url).match(UPLOAD);
  if (!m) return null;
  try {
    const p = decodeURIComponent(m[1]);
    return inside(p, UPLOADS) ? p : null;
  } catch {
    return null;
  }
}

const uploadUrl = (p) => encodeURI(`/${p}`);

/* A video upload -> the upload path of "<name>-poster.jpg" next to it, when the file exists. */
function posterOf(videoUrl, root = ROOT) {
  const video = toUploadPath(videoUrl);
  const p = video && `${video.replace(/\.[^./]+$/, '')}-poster.jpg`;
  return p && inside(p, UPLOADS) && fs.existsSync(path.join(root, p)) ? p : null;
}

/* An upload or variant URL -> its "wp-content/uploads/..." key, else null.
   A variant maps by name: the hash picks one of two uploads with the same base name. */
function originalOf(url, manifest = {}) {
  const upload = toUploadPath(url);
  if (upload) return upload;
  const m = String(url).match(VARIANT_URL);
  let p = null;
  try {
    p = m && decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const v = p && inside(p, VARIANTS) && p.match(VARIANT_NAME);
  if (!v) return null;
  const base = `${UPLOADS}${v[1]}`;
  const keys = Object.keys(manifest)
    .filter((k) => k.slice(0, k.length - path.posix.extname(k).length) === base);
  return keys.find((k) => manifest[k].hash === v[2]) || (keys.length === 1 ? keys[0] : null);
}

function manifestEntry({
  width, height, alpha, hash, lqip,
}) {
  return {
    width,
    height,
    alpha,
    hash,
    widths: { avif: ladder(width, AVIF), [alpha ? 'png' : 'jpg']: ladder(width, FALLBACK) },
    lqip,
  };
}

const missing = (manifest, used) => used.filter((p) => !manifest[p]);

const variantFiles = (manifest) => Object.entries(manifest).flatMap(([p, e]) => Object
  .entries(e.widths).flatMap(([ext, ws]) => ws.map((w) => variantName(p, e.hash, w, ext))));

/* The files below wp-content/variants/ with a variant name that the manifest does not name. */
function staleVariants(manifest, files) {
  const keep = new Set(variantFiles(manifest));
  return files.filter((f) => inside(f, VARIANTS) && VARIANT.test(f) && !keep.has(f));
}

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

/* Never follows a symbolic link (path.resolve drops a trailing "/", which follows one). */
function walk(file) {
  if (!fs.existsSync(file) || fs.lstatSync(path.resolve(file)).isSymbolicLink()) return [];
  if (!fs.statSync(file).isDirectory()) return [file];
  return fs.readdirSync(file, { withFileTypes: true })
    .filter((d) => !d.isSymbolicLink())
    .flatMap((d) => walk(path.join(file, d.name)));
}

function readManifest(root = ROOT) {
  const file = path.join(root, MANIFEST);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

/* Every upload image the site content and the generated pages name, sorted.
   A variant URL (the markup of picture()) counts as its upload. */
function usedImages(root) {
  const manifest = readManifest(root);
  const pages = PAGES.flatMap((p) => walk(path.join(root, p)))
    .filter((f) => path.basename(f) === 'index.html');
  const sources = SOURCES.flatMap((p) => walk(path.join(root, p)));
  const used = new Set();
  [...pages, ...sources].forEach((file) => {
    const text = fs.readFileSync(file, 'utf8').replace(/\\\//g, '/');
    (text.match(REF) || []).forEach((ref) => used.add(toUploadPath(ref)));
    (text.match(VREF) || []).forEach((ref) => used.add(originalOf(ref, manifest)));
    (text.match(MP4) || []).forEach((ref) => used.add(posterOf(ref, root)));
  });
  used.delete(null);
  return [...used].sort();
}

async function encodeImage(sharp, root, uploadPath) {
  const buf = fs.readFileSync(path.join(root, uploadPath));
  const meta = await sharp(buf).metadata();
  const swap = (meta.orientation || 1) >= 5;
  const alpha = Boolean(meta.hasAlpha) && !(await sharp(buf).stats()).isOpaque;
  const small = await sharp(buf).rotate().resize({ width: 16, withoutEnlargement: true })
    .webp({ quality: 40 })
    .toBuffer();
  const entry = manifestEntry({
    width: swap ? meta.height : meta.width,
    height: swap ? meta.width : meta.height,
    alpha,
    hash: hash8(buf),
    lqip: `data:image/webp;base64,${small.toString('base64')}`,
  });
  await Promise.all(Object.entries(entry.widths).flatMap(([ext, ws]) => ws.map((w) => {
    const out = path.join(root, variantName(uploadPath, entry.hash, w, ext));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    return sharp(buf).rotate().resize({ width: w, withoutEnlargement: true })
      .toFormat(...FORMATS[ext])
      .toFile(out);
  })));
  return entry;
}

function installSharp(version) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-'));
  execFileSync('npm', [
    'install', '--no-save', '--no-package-lock', '--prefix', prefix, `sharp@${version}`,
  ], { stdio: 'ignore', timeout: 180000 });
  return createRequire(path.join(prefix, 'node_modules', 'sharp', 'package.json'))('sharp');
}

/* CI only (WORKERS_CI=1): make the variants of uploads without a manifest entry.
   The new entries stay in memory; build/images.json does not change. Never throws:
   a corrupt manifest gives {} in CI (originals), but throws locally so people see it.
   SHORTCUT: at most maxImages images or maxMs per build; the rest fall back to the
   originals until `npm run images` runs locally and the variants are committed. */
async function ensureVariants(root, {
  env = process.env, install = installSharp, encode = encodeImage, log = console.log,
  maxImages = 40, maxMs = 8 * 60 * 1000, now = Date.now,
} = {}) {
  if (env.WORKERS_CI !== '1') return readManifest(root);
  const start = now();
  let manifest = {};
  try {
    manifest = readManifest(root);
    const todo = missing(manifest, usedImages(root))
      .filter((p) => fs.existsSync(path.join(root, p))).slice(0, maxImages);
    if (!todo.length) return manifest;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const sharp = install(pkg.devDependencies.sharp);
    let made = 0;
    await todo.reduce((chain, p) => chain.then(async () => {
      if (now() - start > maxMs) return;
      manifest[p] = await encode(sharp, root, p);
      made += 1;
    }), Promise.resolve());
    log(`images: made variants for ${made} of ${todo.length} new uploads`);
  } catch (error) {
    log(`images: CI fallback skipped (${error.message})`);
  }
  return manifest;
}

const fallbackOf = (e) => (e.widths.png ? 'png' : 'jpg');

/* The largest JPEG/PNG variant (Fancybox), or the URL as given without a manifest entry. */
function zoomSrc(src, manifest) {
  const p = originalOf(src, manifest);
  const e = p && manifest[p];
  if (!e) return src;
  const ext = fallbackOf(e);
  return uploadUrl(variantName(p, e.hash, e.widths[ext].at(-1), ext));
}

/* The smallest JPEG/PNG variant (640 px), for data/search.json minImg. */
function smallSrc(src, manifest) {
  const p = originalOf(src, manifest);
  const e = p && manifest[p];
  if (!e) return src;
  const ext = fallbackOf(e);
  return uploadUrl(variantName(p, e.hash, e.widths[ext][0], ext));
}

/* The img src width: the largest variant up to 1600 px. */
const mainWidth = (e, ext) => e.widths[ext].filter((w) => w <= 1600).at(-1) || e.widths[ext][0];

const srcset = (p, e, ext) => e.widths[ext]
  .map((w) => `${uploadUrl(variantName(p, e.hash, w, ext))} ${w}w`).join(', ');

/* A content image. fancybox: the gallery name; Fancybox reads data-src (the largest variant).
   No manifest entry: the img of the original (an upload or a theme file) in a <picture>,
   sized when the file is readable. */
function picture({
  src, alt = '', slot, priority = false, cls = '', title = '', fancybox = '',
}, manifest = {}) {
  const sizes = SLOTS[slot] && escAttr(SLOTS[slot]);
  if (!sizes) throw new Error(`picture: unknown slot "${slot}"`);
  const p = originalOf(src, manifest);
  const e = p && manifest[p];
  const classAttr = cls ? ` class="${escAttr(cls)}"` : '';
  const zoom = fancybox
    ? ` data-fancybox="${escAttr(fancybox)}" data-src="${escAttr(zoomSrc(src, manifest))}"` : '';
  const tail = ` alt="${escAttr(alt)}"${titleAttr(title)} decoding="async"`
    + `${priority ? PRIORITY : LAZY}`
    + `${zoom} data-overlay-added="true">`;
  if (!e) {
    const file = p || (inside(src.slice(1), THEME) ? src.slice(1) : null);
    const size = file && imageSize(path.join(ROOT, file));
    const wh = size ? ` width="${size.width}" height="${size.height}"` : '';
    const max = size ? ` style="max-width:${size.width}px"` : '';
    return `<picture${max}><img${classAttr} src="${escAttr(p ? uploadUrl(p) : src)}"${wh}${tail}`
      + '</picture>';
  }
  const ext = fallbackOf(e);
  const main = mainWidth(e, ext);
  /* max-width: the file width, as the old <img> of the original. No placeholder behind a
     transparent image: it would show through. */
  const style = ` style="max-width:${e.width}px${e.alpha ? ''
    : `;background-image:url(${escAttr(e.lqip)});background-size:cover`}"`;
  return `<picture${style}>`
    + `<source type="image/avif" srcset="${escAttr(srcset(p, e, 'avif'))}" sizes="${sizes}">`
    + `<img${classAttr} src="${escAttr(uploadUrl(variantName(p, e.hash, main, ext)))}"`
    + ` srcset="${escAttr(srcset(p, e, ext))}" sizes="${sizes}"`
    + ` width="${e.width}" height="${e.height}"${tail}</picture>`;
}

/* A hero video. With "<name>-poster.jpg" next to it: the poster (the 1600 px variant, else the
   original) and its size, so the box and the first paint do not wait for the video.
   href: the poster URL for the head preload, '' without a poster. */
function heroVideo(src, manifest = {}, root = ROOT) {
  const p = posterOf(src, root);
  const e = p && manifest[p];
  let href = '';
  let size = null;
  if (e) {
    const ext = fallbackOf(e);
    href = uploadUrl(variantName(p, e.hash, mainWidth(e, ext), ext));
    size = e;
  } else if (p) {
    href = uploadUrl(p);
    size = imageSize(path.join(root, p));
  }
  const wh = size ? ` width="${size.width}" height="${size.height}"` : '';
  const poster = href ? ` poster="${escAttr(href)}"${wh}` : '';
  return {
    html: `<video autoplay muted loop playsinline${poster}>`
      + `<source src="${escAttr(src)}" type="video/mp4" /></video>`,
    href,
  };
}

/* The head line that starts the poster download first; '' without a poster. */
const preloadLink = (href) => (href
  ? `  <link rel="preload" as="image" href="${escAttr(href)}" fetchpriority="high">\n` : '');

/* The page priority image: the first lazy image in html gets eager and fetchpriority. */
function prioritize(html) {
  if (!html.includes(LAZY)) throw new Error('prioritize: no lazy image');
  return html.replace(LAZY, PRIORITY);
}

const TAG = /<picture\b[^>]*>[\s\S]*?<\/picture>|<img\b[^>]*>/g;

/* Hand-kept markup: each upload image (an old <img> or a <picture> of this script) becomes
   picture(). Idempotent: a second run gives the same text. Other images stay as they are. */
function rewriteImages(text, manifest, slot) {
  return text.replace(TAG, (tag) => {
    const img = tag.match(/<img\b[^>]*>/);
    if (!img) return tag;
    const attr = (name) => decodeEntities(
      (img[0].match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1] || '',
    );
    const src = attr('data-src') || attr('src');
    const p = originalOf(src, manifest);
    if (!p) return tag;
    const cls = attr('class').split(/\s+/).filter((c) => c && c !== 'lazyload').join(' ');
    return picture({
      src: uploadUrl(p), alt: attr('alt'), slot, cls, title: attr('title'),
    }, manifest);
  });
}

/* npm run images: the img/picture markup of the hand-kept files, and data/search.json minImg. */
function rewriteHandKept(root, manifest) {
  const files = HAND_KEPT.flatMap((p) => walk(path.join(root, p)))
    .filter((f) => f.endsWith('.html'));
  const write = (file, text) => {
    if (fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  };
  files.forEach((f) => write(f, rewriteImages(fs.readFileSync(f, 'utf8'), manifest, 'card')));
  const search = path.join(root, SEARCH);
  if (!fs.existsSync(search)) return files.length;
  const list = JSON.parse(fs.readFileSync(search, 'utf8'))
    .map((s) => (s.minImg ? { ...s, minImg: smallSrc(s.minImg, manifest) } : s));
  write(search, JSON.stringify(list, null, 2));
  return files.length + 1;
}

module.exports = {
  MANIFEST,
  SLOTS,
  uploadUrl,
  originalOf,
  zoomSrc,
  smallSrc,
  picture,
  posterOf,
  heroVideo,
  preloadLink,
  prioritize,
  rewriteImages,
  rewriteHandKept,
  VARIANTS,
  ladder,
  variantName,
  toUploadPath,
  manifestEntry,
  missing,
  variantFiles,
  staleVariants,
  hash8,
  walk,
  usedImages,
  readManifest,
  encodeImage,
  ensureVariants,
};
