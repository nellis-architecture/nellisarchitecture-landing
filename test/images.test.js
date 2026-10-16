const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const images = require('../build/lib/images');
const { main: makeImages } = require('../build/make-images');

const root = path.join(__dirname, '..');
const manifestFile = path.join(root, images.MANIFEST);
const A = 'wp-content/uploads/a.jpg';
const B = 'wp-content/uploads/b.jpg';

test('ladder stops at the original width once and never upscales', () => {
  assert.deepEqual(images.ladder(4000), [320, 640, 960, 1600, 2400]);
  assert.deepEqual(images.ladder(2400), [320, 640, 960, 1600, 2400]);
  assert.deepEqual(images.ladder(1000), [320, 640, 960, 1000]);
  assert.deepEqual(images.ladder(960), [320, 640, 960]);
  assert.deepEqual(images.ladder(180), [180]);
  assert.deepEqual(images.ladder(1000, [640, 1600, 2400]), [640, 1000]);
  assert.deepEqual(images.ladder(500, [640, 1600, 2400]), [500]);
  assert.deepEqual(images.ladder(3000, [640, 1600, 2400]), [640, 1600, 2400]);
});

test('variantName keeps the folders below wp-content/uploads/', () => {
  assert.equal(
    images.variantName('wp-content/uploads/2025/07/Zoya1-scaled.jpg', 'abcdef12', 640, 'avif'),
    'wp-content/variants/2025/07/Zoya1-scaled-abcdef12-640.avif',
  );
  assert.equal(
    images.variantName('wp-content/uploads/a.b.png', '00000000', 32, 'png'),
    'wp-content/variants/a.b-00000000-32.png',
  );
});

test('toUploadPath reads root, relative, absolute and encoded upload URLs', () => {
  const want = 'wp-content/uploads/2025/07/Zoya1-scaled.jpg';
  assert.equal(images.toUploadPath('/wp-content/uploads/2025/07/Zoya1-scaled.jpg'), want);
  assert.equal(images.toUploadPath('wp-content/uploads/2025/07/Zoya1-scaled.jpg'), want);
  assert.equal(images.toUploadPath(`https://nellisarchitecture.com/${want}`), want);
  assert.equal(images.toUploadPath(`/${want}?v=2#x`), want);
  assert.equal(
    images.toUploadPath('/wp-content/uploads/2025/05/cropped-%D1%84-1-32x32.png'),
    'wp-content/uploads/2025/05/cropped-ф-1-32x32.png',
  );
  assert.equal(images.toUploadPath('/wp-content/uploads/a%E0%A4%A.jpg'), null);
  assert.equal(images.toUploadPath('https://example.com/wp-content/uploads/a.jpg'), null);
  assert.equal(images.toUploadPath('/wp-content/themes/a.jpg'), null);
  assert.equal(images.toUploadPath('/images/a.jpg'), null);
});

test('toUploadPath rejects dot segments, backslashes and paths that leave uploads', () => {
  [
    '/wp-content/uploads/%2e%2e/x.jpg',
    '/wp-content/uploads/%2E%2E/%2e%2e/x.jpg',
    '/wp-content/uploads/../x.jpg',
    '/wp-content/uploads/2025/../../x.jpg',
    '/wp-content/uploads/./x.jpg',
    '/wp-content/uploads/a/%2e/x.jpg',
    '/wp-content/uploads/a%2F..%2F..%2Fx.jpg',
    '/wp-content/uploads/a%2f..%2fx.jpg',
    '/wp-content/uploads/a\\..\\x.jpg',
    '/wp-content/uploads/a%5C..%5Cx.jpg',
    '/wp-content/uploads//x.jpg',
  ].forEach((url) => assert.equal(images.toUploadPath(url), null, url));
  assert.equal(
    images.toUploadPath('/wp-content/uploads/%252e%252e/x.jpg'),
    'wp-content/uploads/%2e%2e/x.jpg',
  );
  assert.equal(
    images.toUploadPath('/wp-content/uploads/a..b/x.jpg'),
    'wp-content/uploads/a..b/x.jpg',
  );
});

test('variantName throws when the output leaves wp-content/variants/', () => {
  assert.throws(() => images.variantName('wp-content/uploads/../x.jpg', 'abcdef12', 640, 'avif'));
  assert.throws(() => images.variantName('wp-content/uploads/a/../../x.jpg', 'abcdef12', 1, 'jpg'));
  assert.throws(() => images.variantName('wp-content/uploads/a.jpg', '../../x', 640, 'avif'));
});

test('walk does not follow symbolic links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-walk-'));
  try {
    fs.mkdirSync(path.join(dir, 'tree', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'other'));
    fs.writeFileSync(path.join(dir, 'tree', 'sub', 'a.jpg'), 'a');
    fs.writeFileSync(path.join(dir, 'other', 'b.jpg'), 'b');
    fs.symlinkSync(path.join(dir, 'other'), path.join(dir, 'tree', 'link'));
    fs.symlinkSync(path.join(dir, 'other', 'b.jpg'), path.join(dir, 'tree', 'b.jpg'));
    fs.symlinkSync(path.join(dir, 'tree'), path.join(dir, 'tree', 'sub', 'loop'));
    fs.symlinkSync(path.join(dir, 'other'), path.join(dir, 'top'));
    assert.deepEqual(images.walk(path.join(dir, 'tree')), [path.join(dir, 'tree', 'sub', 'a.jpg')]);
    assert.deepEqual(images.walk(path.join(dir, 'top')), []);
    assert.deepEqual(images.walk(`${path.join(dir, 'top')}/`), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('staleVariants lists only unnamed variant files inside wp-content/variants/', () => {
  const entry = { hash: 'abcdef12', widths: { avif: [320], jpg: [640] } };
  const manifest = { 'wp-content/uploads/2025/a.jpg': entry };
  const files = [
    'wp-content/variants/2025/a-abcdef12-320.avif',
    'wp-content/variants/2025/a-abcdef12-640.jpg',
    'wp-content/variants/2025/a-00000000-320.avif',
    'wp-content/variants/old-12345678-1600.png',
    'wp-content/variants/../uploads/x-12345678-640.jpg',
    'wp-content/variants/2025/../../uploads/y-12345678-640.jpg',
    'wp-content/uploads/z-12345678-640.jpg',
    '/etc/z-12345678-640.jpg',
    '../z-12345678-640.jpg',
    'wp-content/variants/.DS_Store',
    'wp-content/variants/README.md',
    'wp-content/variants/2025/a-abcdef12-640.webp',
  ];
  assert.deepEqual(images.staleVariants(manifest, files), [
    'wp-content/variants/2025/a-00000000-320.avif',
    'wp-content/variants/old-12345678-1600.png',
  ]);
  assert.deepEqual(images.staleVariants(manifest, []), []);
});

test('manifestEntry: AVIF and JPEG widths, PNG for alpha', () => {
  const base = {
    width: 1000, height: 500, hash: 'abcdef12', lqip: 'data:image/webp;base64,AA',
  };
  assert.deepEqual(images.manifestEntry({ ...base, alpha: false }), {
    width: 1000,
    height: 500,
    alpha: false,
    hash: 'abcdef12',
    widths: { avif: [320, 640, 960, 1000], jpg: [640, 1000] },
    lqip: 'data:image/webp;base64,AA',
  });
  assert.deepEqual(
    images.manifestEntry({ ...base, alpha: true }).widths,
    { avif: [320, 640, 960, 1000], png: [640, 1000] },
  );
});

test('missing lists the used uploads without a manifest entry', () => {
  const manifest = { [A]: {} };
  assert.deepEqual(images.missing(manifest, [A, 'wp-content/uploads/b.png']), [
    'wp-content/uploads/b.png',
  ]);
  assert.deepEqual(images.missing({}, []), []);
});

test('usedImages finds upload refs in sources, skips videos, SVG and GIF', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-'));
  try {
    fs.mkdirSync(path.join(dir, 'content', 'news'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'content', 'news', 'a.md'), [
      'hero: /wp-content/uploads/2025/01/a.jpg',
      '![x](https://nellisarchitecture.com/wp-content/uploads/2025/01/b%20c.PNG)',
      '/wp-content/uploads/2025/01/v.mp4 /wp-content/uploads/2025/01/s.svg',
      '/wp-content/uploads/g.gif',
    ].join('\n'));
    const search = '{"m":"\\/wp-content\\/uploads\\/d.webp"}';
    fs.writeFileSync(path.join(dir, 'data', 'search.json'), search);
    fs.mkdirSync(path.join(dir, 'news', 'x'), { recursive: true });
    const page = '<img srcset="/wp-content/uploads/e.jpeg 1x, /wp-content/uploads/f.jpg 2x">';
    fs.writeFileSync(path.join(dir, 'news', 'x', 'index.html'), page);
    assert.deepEqual(images.usedImages(dir), [
      'wp-content/uploads/2025/01/a.jpg',
      'wp-content/uploads/2025/01/b c.PNG',
      'wp-content/uploads/d.webp',
      'wp-content/uploads/e.jpeg',
      'wp-content/uploads/f.jpg',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function ciRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-ci-'));
  fs.mkdirSync(path.join(dir, 'content', 'news'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'build'));
  fs.mkdirSync(path.join(dir, 'wp-content', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"devDependencies":{"sharp":"1.2.3"}}');
  fs.writeFileSync(path.join(dir, 'content', 'news', 'a.md'), `/${A} /${B}`);
  fs.writeFileSync(path.join(dir, 'wp-content', 'uploads', 'a.jpg'), 'a');
  fs.writeFileSync(path.join(dir, 'wp-content', 'uploads', 'b.jpg'), 'b');
  return dir;
}

const noInstall = () => assert.fail('must not install');

test('ensureVariants is a no-op without WORKERS_CI', async () => {
  const dir = ciRoot();
  try {
    const manifest = await images.ensureVariants(dir, { env: {}, install: noInstall });
    assert.deepEqual(manifest, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants is a no-op in CI when nothing is missing', async () => {
  const dir = ciRoot();
  try {
    const written = { [A]: { hash: 'x' }, [B]: { hash: 'y' } };
    fs.writeFileSync(path.join(dir, images.MANIFEST), JSON.stringify(written));
    const env = { WORKERS_CI: '1' };
    const manifest = await images.ensureVariants(dir, { env, install: noInstall });
    assert.deepEqual(manifest, written);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants in CI makes the missing variants in memory, with the cap', async () => {
  const dir = ciRoot();
  try {
    fs.writeFileSync(path.join(dir, images.MANIFEST), '{}');
    const calls = [];
    const logs = [];
    const manifest = await images.ensureVariants(dir, {
      env: { WORKERS_CI: '1' },
      install: (version) => {
        calls.push(version);
        return 'sharp';
      },
      encode: async (lib, r, p) => ({ sharp: lib, p }),
      log: (line) => logs.push(line),
      maxImages: 1,
    });
    assert.deepEqual(calls, ['1.2.3']);
    assert.deepEqual(manifest, { [A]: { sharp: 'sharp', p: A } });
    assert.equal(fs.readFileSync(path.join(dir, images.MANIFEST), 'utf8'), '{}');
    assert.equal(logs.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants never throws: an install failure logs one line', async () => {
  const dir = ciRoot();
  try {
    const logs = [];
    const manifest = await images.ensureVariants(dir, {
      env: { WORKERS_CI: '1' },
      install: () => {
        throw new Error('no network');
      },
      log: (line) => logs.push(line),
    });
    assert.deepEqual(manifest, {});
    assert.deepEqual(logs, ['images: CI fallback skipped (no network)']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants in CI: a corrupt manifest logs one line and does not throw', async () => {
  const dir = ciRoot();
  try {
    fs.writeFileSync(path.join(dir, images.MANIFEST), '{"broken');
    const logs = [];
    const manifest = await images.ensureVariants(dir, {
      env: { WORKERS_CI: '1' }, install: noInstall, log: (line) => logs.push(line),
    });
    assert.deepEqual(manifest, {});
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^images: CI fallback skipped/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants: the time cap counts the install time', async () => {
  const dir = ciRoot();
  try {
    let t = 0;
    const manifest = await images.ensureVariants(dir, {
      env: { WORKERS_CI: '1' },
      install: () => {
        t += 10;
        return 'sharp';
      },
      encode: async () => ({}),
      log: () => {},
      maxMs: 5,
      now: () => t,
    });
    assert.deepEqual(manifest, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureVariants stops after maxMs', async () => {
  const dir = ciRoot();
  try {
    let t = 0;
    const manifest = await images.ensureVariants(dir, {
      env: { WORKERS_CI: '1' },
      install: () => 'sharp',
      encode: async () => {
        t += 10;
        return {};
      },
      log: () => {},
      maxMs: 5,
      now: () => t,
    });
    assert.deepEqual(Object.keys(manifest), [A]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every variant that build/images.json names exists on disk', (t) => {
  if (!fs.existsSync(manifestFile)) {
    t.skip('build/images.json does not exist yet: run npm run images');
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const absent = images.variantFiles(manifest).filter((f) => !fs.existsSync(path.join(root, f)));
  assert.deepEqual(absent, []);
});

test('report the used uploads without a manifest entry (warning only)', () => {
  const manifest = images.readManifest(root);
  const absent = images.missing(manifest, images.usedImages(root))
    .filter((p) => fs.existsSync(path.join(root, p)));
  if (absent.length) {
    console.warn(`warning: ${absent.length} uploads have no variants; run npm run images:\n`
      + `${absent.join('\n')}`);
  }
});

test('encodeImage writes the ladder: JPEG for opaque, PNG for alpha, rotated size', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-enc-'));
  try {
    const up = path.join(dir, 'wp-content', 'uploads', '2025');
    fs.mkdirSync(up, { recursive: true });
    const red = { r: 255, g: 0, b: 0 };
    await sharp({
      create: {
        width: 700, height: 300, channels: 3, background: red,
      },
    })
      .withMetadata({ orientation: 6 }).jpeg().toFile(path.join(up, 'a.jpg'));
    await sharp({
      create: {
        width: 400, height: 200, channels: 4, background: { ...red, alpha: 0.5 },
      },
    })
      .png().toFile(path.join(up, 'b.png'));
    const a = await images.encodeImage(sharp, dir, 'wp-content/uploads/2025/a.jpg');
    const b = await images.encodeImage(sharp, dir, 'wp-content/uploads/2025/b.png');
    assert.deepEqual([a.width, a.height, a.alpha], [300, 700, false]);
    assert.deepEqual(a.widths, { avif: [300], jpg: [300] });
    assert.deepEqual([b.alpha, b.widths], [true, { avif: [320, 400], png: [400] }]);
    assert.match(a.lqip, /^data:image\/webp;base64,/);
    const files = images.variantFiles({
      'wp-content/uploads/2025/a.jpg': a, 'wp-content/uploads/2025/b.png': b,
    });
    assert.equal(files.length, 5);
    const meta = await sharp(path.join(dir, files[0])).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['heif', 300, 700]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot() {
  const dir = ciRoot();
  fs.writeFileSync(path.join(dir, images.MANIFEST), '{}');
  const stale = path.join(dir, 'wp-content', 'variants', 'old-12345678-640.avif');
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, 'x');
  return { dir, stale };
}

const quiet = { log: () => {}, warn: () => {} };

test('make-images deletes stale variants after a clean run', async () => {
  const { dir, stale } = makeRoot();
  try {
    await makeImages(dir, { ...quiet, encode: async () => ({ hash: 'abcdef12', widths: {} }) });
    assert.equal(fs.existsSync(stale), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('make-images keeps every variant when an encode fails', async () => {
  const { dir, stale } = makeRoot();
  try {
    const warns = [];
    await makeImages(dir, {
      log: () => {},
      warn: (line) => warns.push(line),
      encode: async () => {
        throw new Error('sharp is broken');
      },
    });
    assert.equal(fs.existsSync(stale), true);
    assert.match(warns.at(-1), /stale delete skipped/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('make-images deletes nothing when wp-content/variants is a symbolic link', async () => {
  const { dir, stale } = makeRoot();
  try {
    const real = path.join(dir, 'real');
    fs.renameSync(path.dirname(stale), real);
    fs.symlinkSync(real, path.dirname(stale));
    const warns = [];
    await makeImages(dir, {
      log: () => {},
      warn: (line) => warns.push(line),
      encode: async () => ({ hash: 'abcdef12', widths: {} }),
    });
    assert.equal(fs.existsSync(path.join(real, 'old-12345678-640.avif')), true);
    assert.match(warns.at(-1), /symbolic link/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function posterRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-poster-'));
  fs.mkdirSync(path.join(dir, 'wp-content', 'uploads', '2025'), { recursive: true });
  const jpg = await sharp({
    create: {
      width: 40, height: 30, channels: 3, background: '#808080',
    },
  }).jpeg().toBuffer();
  ['2025/v-poster.jpg', '2025/a&b"-poster.jpg'].forEach((f) => {
    fs.writeFileSync(path.join(dir, 'wp-content', 'uploads', f), jpg);
  });
  return dir;
}

test('posterOf finds <name>-poster.jpg next to an upload video, else null', async () => {
  const dir = await posterRoot();
  try {
    const want = 'wp-content/uploads/2025/v-poster.jpg';
    assert.equal(images.posterOf('/wp-content/uploads/2025/v.mp4', dir), want);
    const abs = 'https://nellisarchitecture.com/wp-content/uploads/2025/v.mp4';
    assert.equal(images.posterOf(abs, dir), want);
    assert.equal(images.posterOf('/wp-content/uploads/2025/none.mp4', dir), null);
    assert.equal(images.posterOf('/wp-content/uploads/2025/v-poster.png', dir), null);
    assert.equal(images.posterOf('/wp-content/themes/v.mp4', dir), null);
    assert.equal(images.posterOf('/wp-content/uploads/x/../2025/v.mp4', dir), null);
    assert.equal(images.posterOf('/wp-content/uploads/2025\\v.mp4', dir), null);
    assert.equal(images.posterOf('/wp-content/uploads/2025/v.mp4'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('usedImages adds the poster of a video named in the project data and the news', async () => {
  const dir = await posterRoot();
  try {
    fs.mkdirSync(path.join(dir, 'content', 'news'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(
      path.join(dir, 'data', 'projects.json'),
      '{"first_img_video":"\\/wp-content\\/uploads\\/2025\\/v.mp4"}',
    );
    fs.writeFileSync(
      path.join(dir, 'content', 'news', 'a.md'),
      'hero: "/wp-content/uploads/2025/none.mp4"',
    );
    assert.deepEqual(images.usedImages(dir), [
      'wp-content/uploads/2025/v-poster.jpg',
    ]);
    fs.writeFileSync(
      path.join(dir, 'content', 'news', 'a.md'),
      'hero: "https://nellisarchitecture.com/wp-content/uploads/2025/v.mp4"',
    );
    fs.rmSync(path.join(dir, 'data', 'projects.json'));
    assert.deepEqual(images.usedImages(dir), ['wp-content/uploads/2025/v-poster.jpg']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('heroVideo: poster variant, poster original or no poster; preloadLink', async () => {
  const dir = await posterRoot();
  const tail = (src) => `<source src="${src}" type="video/mp4" /></video>`;
  try {
    const poster = 'wp-content/uploads/2025/v-poster.jpg';
    const manifest = {
      [poster]: images.manifestEntry({
        width: 1920, height: 1080, alpha: false, hash: 'abcdef12', lqip: 'x',
      }),
    };
    const variant = '/wp-content/variants/2025/v-poster-abcdef12-1600.jpg';
    assert.deepEqual(images.heroVideo('/wp-content/uploads/2025/v.mp4', manifest, dir), {
      html: `<video autoplay muted loop playsinline poster="${variant}"`
        + ` width="1920" height="1080">${tail('/wp-content/uploads/2025/v.mp4')}`,
      href: variant,
    });
    const odd = '/wp-content/uploads/2025/a&b".mp4';
    const original = '/wp-content/uploads/2025/a&b%22-poster.jpg';
    assert.deepEqual(images.heroVideo(odd, {}, dir), {
      html: `<video autoplay muted loop playsinline poster="${original.replace('&', '&amp;')}"`
        + ` width="40" height="30">${tail('/wp-content/uploads/2025/a&amp;b&quot;.mp4')}`,
      href: original,
    });
    const none = images.heroVideo('/wp-content/uploads/2025/none.mp4', manifest, dir);
    assert.deepEqual(none, {
      html: `<video autoplay muted loop playsinline>${tail('/wp-content/uploads/2025/none.mp4')}`,
      href: '',
    });
    assert.equal(images.preloadLink(''), '');
    assert.equal(
      images.preloadLink('/a&b.jpg'),
      '  <link rel="preload" as="image" href="/a&amp;b.jpg" fetchpriority="high">\n',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
