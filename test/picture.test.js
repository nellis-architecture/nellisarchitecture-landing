const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const images = require('../build/lib/images');
const { escAttr } = require('../build/lib/html');

const {
  picture, prioritize, originalOf, SLOTS,
} = images;
const JPG = 'wp-content/uploads/2025/07/Big.jpg';
const SMALL = 'wp-content/uploads/2025/07/Small.jpg';
const PNG = 'wp-content/uploads/2025/07/Logo.png';
const entry = (width, height, alpha, hash) => ({
  ...images.manifestEntry({
    width, height, alpha, hash, lqip: 'data:image/webp;base64,AAA+/=',
  }),
});
const MANIFEST = {
  [JPG]: entry(3840, 2160, false, 'aaaaaaaa'),
  [SMALL]: entry(1000, 500, false, 'bbbbbbbb'),
  [PNG]: entry(2000, 1000, true, 'cccccccc'),
};
const V = '/wp-content/variants/2025/07/';
const attr = (html, name) => (html.match(new RegExp(`<img[^>]* ${name}="([^"]*)"`)) || [])[1];
const avif = (html) => html.match(/<source type="image\/avif" srcset="([^"]*)" sizes="([^"]*)">/);

test('picture: AVIF and JPEG ladders in width order, 1600 fallback src, size and guard', () => {
  const html = picture({ src: `/${JPG}`, alt: 'A', slot: 'card' }, MANIFEST);
  assert.equal(avif(html)[1], [320, 640, 960, 1600, 2400]
    .map((w) => `${V}Big-aaaaaaaa-${w}.avif ${w}w`).join(', '));
  assert.equal(attr(html, 'srcset'), [640, 1600, 2400]
    .map((w) => `${V}Big-aaaaaaaa-${w}.jpg ${w}w`).join(', '));
  assert.equal(attr(html, 'src'), `${V}Big-aaaaaaaa-1600.jpg`);
  assert.equal(attr(html, 'width'), '3840');
  assert.equal(attr(html, 'height'), '2160');
  assert.equal(attr(html, 'decoding'), 'async');
  assert.equal(attr(html, 'loading'), 'lazy');
  assert.equal(attr(html, 'data-overlay-added'), 'true');
  assert.ok(!html.includes('fetchpriority'));
  assert.ok(!html.includes('lazyload'));
  assert.ok(!html.includes('data-src'));
  assert.ok(html.startsWith('<picture style="max-width:3840px;'
    + 'background-image:url(data:image/webp;base64,AAA+/=);background-size:cover"><source'));
  assert.ok(html.endsWith('></picture>'));
});

test('picture: each slot gives its sizes to the source and the img', () => {
  Object.keys(SLOTS).forEach((slot) => {
    const html = picture({ src: `/${JPG}`, slot }, MANIFEST);
    assert.equal(avif(html)[2], escAttr(SLOTS[slot]), slot);
    assert.equal(attr(html, 'sizes'), escAttr(SLOTS[slot]), slot);
  });
  assert.throws(() => picture({ src: `/${JPG}`, slot: 'nope' }, MANIFEST), /unknown slot/);
});

test('picture: a small original is the largest step and the fallback src', () => {
  const html = picture({ src: `/${SMALL}`, slot: 'full' }, MANIFEST);
  assert.equal(attr(html, 'src'), `${V}Small-bbbbbbbb-1000.jpg`);
  assert.equal(
    attr(html, 'srcset'),
    `${V}Small-bbbbbbbb-640.jpg 640w, ${V}Small-bbbbbbbb-1000.jpg 1000w`,
  );
});

test('picture: a transparent image gets PNG variants and no placeholder background', () => {
  const html = picture({ src: `/${PNG}`, slot: 'card' }, MANIFEST);
  assert.ok(html.startsWith('<picture style="max-width:2000px"><source'));
  assert.equal(attr(html, 'src'), `${V}Logo-cccccccc-1600.png`);
  assert.match(attr(html, 'srcset'), /-640\.png 640w, .*-2000\.png 2000w$/);
});

test('picture: escapes alt, title and class; an empty title gives no attribute', () => {
  const html = picture({
    src: `/${JPG}`, alt: 'a "b" <c> & d', title: 'T "q"', cls: 'x "y"', slot: 'card',
  }, MANIFEST);
  assert.ok(html.includes(' alt="a &quot;b&quot; &lt;c&gt; &amp; d" title="T &quot;q&quot;"'));
  assert.ok(html.includes('<img class="x &quot;y&quot;" src='));
  assert.ok(!picture({ src: `/${JPG}`, title: ' ', slot: 'card' }, MANIFEST).includes('title='));
});

test('picture: priority is eager with fetchpriority; fancybox adds the largest variant', () => {
  const html = picture({
    src: `/${JPG}`, slot: 'full', priority: true, fancybox: 'galleryHI',
  }, MANIFEST);
  assert.ok(html.includes(' loading="eager" fetchpriority="high" data-fancybox="galleryHI" '
    + `data-src="${V}Big-aaaaaaaa-2400.jpg" data-overlay-added="true">`));
  assert.ok(!html.includes('loading="lazy"'));
});

test('picture: no manifest entry gives the original img in a picture, sized when readable', () => {
  const real = 'wp-content/uploads/2024/01/Orel1.png';
  assert.equal(
    picture({ src: `/${real}`, alt: 'O', slot: 'card' }, {}),
    `<picture style="max-width:1536px"><img src="/${real}" width="1536" height="1024" alt="O" `
      + 'decoding="async" loading="lazy" data-overlay-added="true"></picture>',
  );
  assert.equal(
    picture({ src: '/wp-content/uploads/none.jpg', slot: 'card', fancybox: 'g' }, {}),
    '<picture><img src="/wp-content/uploads/none.jpg" alt="" decoding="async" loading="lazy" '
      + 'data-fancybox="g" data-src="/wp-content/uploads/none.jpg" data-overlay-added="true">'
      + '</picture>',
  );
});

test('picture: a theme file without a manifest entry gets its size; others do not', () => {
  const minis = '/wp-content/themes/nellis/assets/img/minis.png';
  assert.match(
    picture({ src: minis, slot: 'teaser' }, {}),
    /^<picture style="max-width:1452px"><img src="[^"]+" width="1452" height="756" /,
  );
  assert.match(
    picture({ src: '/wp-content/themes/../uploads/2024/01/Orel1.png', slot: 'teaser' }, {}),
    /^<picture><img src="[^"]+" alt=/,
  );
});

test('originalOf maps a variant URL back to its upload; the hash picks between twins', () => {
  assert.equal(originalOf(`${V}Big-aaaaaaaa-640.avif`, MANIFEST), JPG);
  const abs = `https://nellisarchitecture.com${V}Small-12345678-1000.jpg`;
  assert.equal(originalOf(abs, MANIFEST), SMALL);
  assert.equal(originalOf(`/${JPG}`, {}), JPG);
  const twins = {
    'wp-content/uploads/a.jpg': { hash: '11111111' },
    'wp-content/uploads/a.png': { hash: '22222222' },
  };
  assert.equal(
    originalOf('/wp-content/variants/a-22222222-640.png', twins),
    'wp-content/uploads/a.png',
  );
  assert.equal(originalOf('/wp-content/variants/a-33333333-640.png', twins), null);
  assert.equal(originalOf('/wp-content/variants/../uploads/x-aaaaaaaa-1.jpg', MANIFEST), null);
  assert.equal(originalOf('/wp-content/themes/x.png', MANIFEST), null);
  assert.equal(originalOf(`${V}%E0%A4-aaaaaaaa-1.jpg`, MANIFEST), null);
});

test('prioritize marks only the first lazy image and needs one', () => {
  const two = `${picture({ src: `/${JPG}`, slot: 'card' }, MANIFEST)}`
    + `${picture({ src: `/${SMALL}`, slot: 'card' }, MANIFEST)}`;
  const out = prioritize(two);
  assert.equal(out.split('fetchpriority="high"').length, 2);
  assert.ok(out.indexOf('fetchpriority') < out.indexOf('Small'));
  assert.equal(out.split('loading="lazy"').length, 2);
  assert.throws(() => prioritize('<img src="/a.jpg">'), /no lazy image/);
});

test('usedImages counts a variant URL as its upload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'used-'));
  try {
    fs.mkdirSync(path.join(dir, 'build'));
    fs.mkdirSync(path.join(dir, 'data', 'filters'), { recursive: true });
    fs.writeFileSync(path.join(dir, images.MANIFEST), JSON.stringify(MANIFEST));
    const html = picture({ src: `/${JPG}`, slot: 'card' }, MANIFEST);
    fs.writeFileSync(path.join(dir, 'data', 'filters', 'a.html'), html);
    assert.deepEqual(images.usedImages(dir), [JPG]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
