const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  previewPages, previewScript, forPreview, register, pathShim,
} = require('../build/lib/preview');
const { readSite, renderPages } = require('../build/lib/pages');
const { loadProjects } = require('../build/lib/projects');
const { readManifest } = require('../build/lib/images');
const studio = require('../build/lib/pages/studio');
const people = require('../build/lib/pages/people');
const { parseFrontMatter } = require('../build/lib/markdown');

delete process.env.TURNSTILE_SITEKEY;

const ROOT = path.join(__dirname, '..');
const NEWS = '/news/';
const MANIFEST = readManifest(ROOT);
const SCRIPT = previewScript(ROOT, MANIFEST, NEWS);
const PAGES = previewPages(ROOT);
/* The entry data the CMS passes: JSON pages as they are, .md pages as front matter + body. */
const content = (name) => {
  const md = path.join(ROOT, 'content', 'pages', `${name}.md`);
  if (fs.existsSync(md)) {
    const { fm, body } = parseFrontMatter(fs.readFileSync(md, 'utf8'), md);
    return { ...fm, body };
  }
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pages', `${name}.json`), 'utf8'));
};

/* Only `window`: no real require, fs or process. */
function run(window = {}) {
  vm.runInNewContext(SCRIPT, { window });
  return window;
}

/* A fake window.CMS: the preview templates, the widgets that patchCms wraps, the editor
   components. */
function fakeCms() {
  const templates = {};
  const widgets = {
    image: { control: 'ImageControl', preview: 'ImagePreview', schema: { s: 1 } },
    markdown: { control: 'MarkdownControl', preview: 'MarkdownPreview', schema: { s: 2 } },
  };
  const components = {};
  return {
    templates,
    widgets,
    components,
    registerPreviewTemplate: (n, c) => {
      templates[n] = c;
    },
    getWidget: (n) => widgets[n],
    registerWidget: (w) => {
      widgets[w.name] = {
        control: w.controlComponent, preview: w.previewComponent, schema: w.schema,
      };
    },
    registerEditorComponent: (c) => {
      components[c.id] = c;
    },
  };
}

const { NellisPreview } = run();

test('previewPages: the PAGES pages without news and contact', () => {
  assert.deepEqual(PAGES.map((p) => p.content), [
    'index', 'studio', 'people', 'privacy', 'projects', 'projects-architecture',
    'projects-interior-design', 'projects-landscape', 'projects-master-planning',
  ]);
});

test('the preview render equals the build output for each page', () => {
  const built = renderPages(ROOT, NEWS, loadProjects(ROOT), null, MANIFEST);
  PAGES.forEach((p) => {
    const page = built.find((b) => b.slug === p.slug);
    assert.equal(NellisPreview.render(p.content, content(p.content)), page.html, p.content);
  });
});

test('edited content gives the same output in the preview and in the build', () => {
  const site = readSite(ROOT);
  const projects = loadProjects(ROOT);
  const ctx = (slug) => ({
    site, newsHref: NEWS, page: { slug }, root: ROOT, projects, posts: null, manifest: MANIFEST,
  });
  const s = content('studio');
  s.intro.title = 'New <b> & "q"';
  assert.equal(NellisPreview.render('studio', s), studio.render(s, ctx('studio')));
  const p = content('people');
  p.people.reverse();
  assert.equal(NellisPreview.render('people', p), people.render(p, ctx('people')));
});

test('the script registers one preview template per page, each a file of admin/config.yml', () => {
  const names = [];
  const cms = fakeCms();
  cms.registerPreviewTemplate = (n) => names.push(n);
  run({ CMS: cms, h: () => null });
  assert.deepEqual(names, PAGES.map((p) => p.content));
  const config = fs.readFileSync(path.join(ROOT, 'admin', 'config.yml'), 'utf8');
  names.forEach((n) => assert.ok(config.includes(`name: "${n}"`), n));
  assert.ok(!names.includes('news') && !names.includes('contact'));
});

const LAZY = '<img data-src="/wp-content/uploads/2025/02/logo.png" alt="logo" '
  + 'src="data:image/svg+xml;base64,PHN2Zz4=" class="lazyload" style="--w: 1px;" />';

test('forPreview shows lazyload images without the theme JS', () => {
  assert.equal(
    forPreview(LAZY, {}, null),
    '<img src="/wp-content/uploads/2025/02/logo.png" alt="logo" style="--w: 1px;" />',
  );
  assert.equal(
    forPreview('<img data-src="/a.png" src="data:x" class="a lazyload b">', {}, null),
    '<img src="/a.png" class="a b">',
  );
});

test('forPreview swaps a new upload for the CMS asset URL, and nothing else', () => {
  const asset = (url) => ({ toString: () => url });
  const blob = () => asset('blob:x');
  const v = '/wp-content/variants/pages/a-12345678-640.jpg';
  const pic = `<picture><img src="${v}" srcset="${v} 640w" alt=""></picture>`;
  assert.equal(forPreview(pic, {}, blob), pic);
  assert.equal(
    forPreview('<img src="/wp-content/uploads/pages/new.jpg" alt="">', {}, blob),
    '<img src="blob:x" alt="">',
  );
  const same = '<img src="/wp-content/uploads/pages/old%20a.jpg" alt="">';
  assert.equal(forPreview(same, {}, asset), same);
  const known = { 'wp-content/uploads/pages/new.jpg': {} };
  const listed = '<img src="/wp-content/uploads/pages/new.jpg" alt="">';
  assert.equal(forPreview(listed, known, blob), listed);
});

test('register shows the render error in the pane and does not throw', () => {
  const templates = {};
  const cms = {
    registerPreviewTemplate: (n, c) => {
      templates[n] = c;
    },
  };
  const h = (tag, props, text) => ({ tag, props, text });
  register(cms, h, [{ content: 'studio' }], () => {
    throw new Error('boom');
  }, forPreview, {});
  const props = { entry: { get: () => ({ toJS: () => ({}) }) }, getAsset: null };
  assert.deepEqual(templates.studio(props), {
    tag: 'p', props: null, text: 'Preview not available: boom',
  });
});

test('the preview pane of a page is a sandboxed iframe without scripts', () => {
  const { templates } = run({ CMS: fakeCms(), h: (tag, props) => ({ tag, props }) }).CMS;
  const props = { entry: { get: () => ({ toJS: () => content('privacy') }) }, getAsset: null };
  const out = templates.privacy(props);
  assert.equal(out.tag, 'iframe');
  assert.equal(out.props.sandbox, 'allow-same-origin');
  const html = forPreview(NellisPreview.render('privacy', content('privacy')), MANIFEST, null);
  assert.equal(out.props.srcDoc, html);
  assert.ok(!html.includes('class="lazyload"'));
  const bad = templates.studio({ entry: { get: () => ({ toJS: () => ({}) }) } });
  assert.equal(bad.tag, 'p');
});

test('the preview shows an unsaved upload and names the file of a bad schema', () => {
  const { templates } = run({
    CMS: fakeCms(), h: (tag, props, text) => ({ tag, props, text }),
  }).CMS;
  const data = content('studio');
  data.intro.photo.src = '/wp-content/uploads/pages/draft-new.jpg';
  const media = [{ path: 'wp-content/uploads/pages/draft-new.jpg', url: 'blob:x/1' }];
  const entry = (d) => ({
    get: (key) => ({ toJS: () => (key === 'mediaFiles' ? media : d) }),
  });
  const out = templates.studio({ entry: entry(data), getAsset: (p) => p });
  assert.ok(out.props.srcDoc.includes('src="blob:x/1"'));
  assert.ok(!out.props.srcDoc.includes('src="/wp-content/uploads/pages/draft-new.jpg"'));
  const bad = { ...data, seo: { ...data.seo, schema: '{"a":' } };
  const message = templates.studio({ entry: entry(bad) }).text;
  assert.match(message, /content\/pages\/studio\.json: schema/);
});

test('patchCms: the image widget and the body preview show an unpublished upload', () => {
  const cms = fakeCms();
  run({ CMS: cms, h: (type, props) => ({ type, props }) });
  const media = [{ path: 'wp-content/uploads/news/draft-new.jpg', url: 'blob:x/1' }];
  const entry = { get: (key) => (key === 'mediaFiles' ? { toJS: () => media } : undefined) };
  const getAsset = (p, field) => `asset:${p}:${field}`;
  const draft = '/wp-content/uploads/news/draft-new.jpg';
  const published = '/wp-content/uploads/2025/02/logo.png';
  const { image, markdown } = cms.widgets;
  const control = image.control({ getEntry: () => entry, getAsset, value: draft });
  assert.equal(control.type, 'ImageControl');
  assert.equal(control.props.value, draft);
  assert.equal(control.props.getAsset(draft, 'f'), 'blob:x/1');
  assert.equal(control.props.getAsset(published, 'f'), `asset:${published}:f`);
  [image.preview({ entry, getAsset }), markdown.preview({ entry, getAsset })].forEach((out, i) => {
    assert.equal(out.type, ['ImagePreview', 'MarkdownPreview'][i]);
    assert.equal(out.props.getAsset(draft), 'blob:x/1');
    assert.equal(out.props.getAsset(published, 'f'), `asset:${published}:f`);
  });
  assert.equal(markdown.control, 'MarkdownControl');
  assert.deepEqual([image.schema, markdown.schema], [{ s: 1 }, { s: 2 }]);
});

test('patchCms: "---" is a block that keeps its blank line', () => {
  const cms = fakeCms();
  run({ CMS: cms, h: () => null });
  const { separator } = cms.components;
  assert.ok(separator.pattern.test('---'));
  assert.ok(!separator.pattern.test('----') && !separator.pattern.test('--- x'));
  assert.equal(Object.keys(separator.fromBlock(['---'])).length, 0);
  assert.equal(separator.toBlock({}), '\n---');
  assert.equal(separator.toPreview({}), '<hr />');
});

test('pathShim matches node:path.posix', () => {
  const shim = pathShim();
  const { posix } = path;
  [
    ['join', 'build/lib', '..', '..'], ['join', '.', 'data', 'search.json'],
    ['join', 'build/lib', 'partials'], ['join', 'build/lib/pages', '../html'],
    ['join', '', 'a'], ['join'],
    ['normalize', 'a//b/./c/../d'], ['normalize', '/a/../../b/'], ['normalize', './'],
    ['normalize', '../a/..'], ['normalize', '/'],
    ['dirname', 'wp-content/uploads/2025/02/a.b.jpg'], ['dirname', 'a'], ['dirname', '/a'],
    ['dirname', 'a/b/'],
    ['extname', 'wp-content/uploads/2025/02/a.b.jpg'], ['extname', '.htaccess'],
    ['extname', 'a/b'], ['extname', 'a.'],
    ['basename', 'wp-content/uploads/2025/02/a.b.jpg'],
    ['basename', 'wp-content/uploads/2025/02/a.b.jpg', '.jpg'], ['basename', 'a/b/'],
  ].forEach(([fn, ...args]) => {
    assert.equal(shim[fn](...args), posix[fn](...args), `${fn}(${args.join(', ')})`);
  });
  assert.equal(shim.posix, shim);
});

test('the script has no absolute or Windows path', () => {
  assert.ok(!SCRIPT.includes(ROOT), 'absolute root');
  assert.ok(!SCRIPT.includes(ROOT.split(path.sep).join('/')), 'absolute root (posix)');
  assert.ok(!/build\\\\?lib/.test(SCRIPT), 'backslash path');
  const header = '/* Generated by npm run build (build/lib/preview.js). Do not edit. */';
  assert.ok(SCRIPT.startsWith(header));
});
