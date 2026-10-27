const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseRules, parseFixed, fixedFroms, hitsFixed, onDisk, validate, autoNewsRules, mergeRules,
  render,
} = require('../build/lib/redirects');
const { pruneNews, writeRedirects } = require('../build-news');

const root = path.join(__dirname, '..');
const FIXED_TEXT = fs.readFileSync(path.join(root, 'build', 'redirects.txt'), 'utf8');
const FIXED = parseFixed(FIXED_TEXT);
const FROMS = fixedFroms(FIXED);

function tempSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redirects-'));
  Object.entries(files).forEach(([file, text]) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  });
  return dir;
}

const site = tempSite({
  'index.html': '',
  'studio/index.html': '',
  'news/new/index.html': '',
  'sitemap.xml': '',
  'robots.txt': '',
  '404.html': '',
  'data/news.json': '',
  'js/static-backend.js': '',
  'wp-content/uploads/2025/02/logo.png': '',
});
const opts = { exists: onDisk(site), fixedFroms: FROMS };
const check = (rules) => validate(rules, opts);
const one = (from, to = '/studio/') => check([{ from, to }]);

test('parseRules reads the CMS file and drops the note', () => {
  const json = '{"redirects":[{"from":"/a","to":"/","note":"x"}]}';
  assert.deepEqual(parseRules(json), [{ from: '/a', to: '/' }]);
  assert.deepEqual(parseRules('{"redirects":[]}'), []);
});

test('valid rules pass', () => {
  assert.deepEqual(check([
    { from: '/old-x', to: '/studio/' },
    { from: '/old/y/', to: '/' },
    { from: '/a.b_c~d', to: '/news/new/' },
    { from: '/ext', to: 'https://example.com/page' },
  ]), []);
});

test('a bad "from" fails', () => {
  const bad = ['old', '/a b', '/a?b', '/a#b', '/a*', '/a:b', '/a%20b', '/a/../b', '/a//b', '',
    undefined];
  bad.forEach((from) => {
    const errors = one(from);
    assert.equal(errors.length, 1, String(from));
    assert.match(errors[0], /"from" must be a path/);
  });
});

test('a bad "to" fails', () => {
  // eslint-disable-next-line no-script-url -- the test feeds a script URL to the check
  ['news/x', 'javascript:x', 'ftp://x.com/', 'https://', '/a b', ''].forEach((to) => {
    assert.match(one('/old', to).join(), /"to" must be a path like/, to);
  });
  assert.match(one('/old', '/missing/').join(), /"to" \/missing\/ does not exist/);
});

test('a "from" that is a live page or file fails', () => {
  const live = ['/studio/', '/studio', '/sitemap.xml', '/robots.txt', '/404.html',
    '/data/news.json', '/js/static-backend.js', '/wp-content/uploads/2025/02/logo.png',
    '/news/new/', '/'];
  live.forEach((from) => {
    assert.match(one(from, '/news/new/').join(), /is a live page or file/, from);
  });
});

test('a "from" that matches build/redirects.txt or /admin/ fails', () => {
  ['/pravicy', '/pravicy/', '/sitemap_index.xml', '/news/tag/x', '/news/tag', '/news/x/feed',
    '/news/x/feed/'].forEach((from) => {
    assert.match(one(from).join(), /matches a rule in build\/redirects\.txt/, from);
  });
  ['/news/a/b/feed', '/news/feed', '/news/tagx'].forEach((from) => {
    assert.deepEqual(one(from), [], from);
  });
  ['/admin', '/admin/', '/admin/x'].forEach((from) => {
    assert.match(one(from).join(), /must not be under \/admin\//, from);
  });
});

test('from = to, duplicates and a two-rule loop fail', () => {
  const temp = tempSite({ 'a/index.html': '' });
  const same = validate([{ from: '/a', to: '/a/' }], { exists: onDisk(temp), fixedFroms: [] });
  assert.match(same.join(), /are the same/);
  const dup = check([{ from: '/a', to: '/' }, { from: '/a/', to: '/studio/' }]);
  assert.match(dup.join(), /duplicate "from" \/a\//);
  const loop = check([{ from: '/a', to: '/b/' }, { from: '/b', to: '/a' }]);
  assert.match(loop.join(), /loop: \/b\/ redirects back to \/a/);
  assert.match(loop.join(), /loop: \/a redirects back to \/b/);
});

test('case is kept: /A and /a are different', () => {
  assert.deepEqual(check([{ from: '/A', to: '/' }, { from: '/a', to: '/' }]), []);
});

test('autoNewsRules adds a rule only when the file name differs from the slug', () => {
  assert.deepEqual(autoNewsRules([
    { filename: 'old', slug: 'new' },
    { filename: 'same', slug: 'same' },
  ]), [{ from: '/news/old/', to: '/news/new/' }]);
});

test('mergeRules drops an auto rule that hits a live URL or a manual "from"', () => {
  const auto = [
    { from: '/news/new/', to: '/news/other/' },
    { from: '/news/manual/', to: '/news/new/' },
    { from: '/news/gone/', to: '/news/new/' },
  ];
  const manual = [{ from: '/news/manual', to: '/' }];
  assert.deepEqual(mergeRules(manual, auto, onDisk(site)), [
    { from: '/news/manual', to: '/' },
    { from: '/news/gone/', to: '/news/new/' },
  ]);
});

test('render writes the header and two 301 lines per rule, one for each slash form', () => {
  const header = '# Generated by build-news.js from build/redirects.txt, content/redirects.json '
    + 'and news slugs. Do not edit.\n';
  assert.equal(render([]), header);
  assert.equal(
    render([{ from: '/old-x', to: '/studio/' }, { from: '/e/', to: 'https://x.com/' }]),
    `${header}/old-x /studio/ 301\n/old-x/ /studio/ 301\n/e https://x.com/ 301\n`
      + '/e/ https://x.com/ 301\n',
  );
});

test('render puts the static fixed rules first and the dynamic fixed rules last', () => {
  const fixed = parseFixed('/s /x 301\n/d/* /x 301\n/n/:a/f /n/:a/ 301\n/t/ /f.xml 200\n');
  assert.equal(
    render([{ from: '/c', to: '/' }], fixed).split('\n').slice(1).join('\n'),
    '/s /x 301\n/t/ /f.xml 200\n/c / 301\n/c/ / 301\n/d/* /x 301\n/n/:a/f /n/:a/ 301\n',
  );
});

test('parseFixed skips comments and blank lines', () => {
  assert.deepEqual(parseFixed('# a\n\n  /a /b/ 301\n/c/* /d 200\n'), [
    { from: '/a', to: '/b/', status: 301 },
    { from: '/c/*', to: '/d', status: 200 },
  ]);
});

test('parseFixed throws on a bad line and names the file and the line number', () => {
  ['/a /b 404', '/a /b 302', '/a /b 301!', '/a /b', '/a /b 301 x', 'a /b 301', '/a b 301',
    '/a* /b 301', '/a?x /b 301', '/a% /b 301', '/a%d /b 301', '/a%zz /b 301'].forEach((line) => {
    const re = /^Error: build\/redirects\.txt line 2: /;
    assert.throws(() => parseFixed(`# c\n${line}\n`), re, line);
  });
});

test('parseFixed takes a percent-encoded byte in lowercase or uppercase hex', () => {
  assert.deepEqual(parseFixed('/a%d0%B1 /b 301\n').map((r) => r.from), ['/a%d0%B1']);
});

const RU = '/news/category/%d0%b1%d0%b5%d0%b7-%d1%80%d1%83%d0%b1%d1%80%d0%b8%d0%ba%d0%b8';

test('old news category URLs: the index and the Russian URL go to /news/, other topics 404', () => {
  const has = (from) => assert.ok(
    FIXED.some((r) => r.from === from && r.to === '/news/' && r.status === 301),
    from,
  );
  const upper = RU.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
  ['/news/category', '/news/category/', RU, `${RU}/`, upper, `${upper}/`].forEach(has);
  assert.ok(!FIXED.some((r) => r.from.startsWith('/news/category/*')));
  ['villa-design-architecture', 'interior-design', 'landscape-outdoor-living',
    'dubai-lifestyle-trends', 'studio-news-culture', 'x'].forEach((slug) => {
    assert.equal(hitsFixed(`/news/category/${slug}/`, FROMS), undefined, slug);
  });
  [RU, `${RU}/`, upper, '/news/category', '/news/category/'].forEach((from) => {
    assert.ok(hitsFixed(from, FROMS), from);
  });
});

test('every fixed rule has both slash forms', () => {
  const froms = new Set(FIXED.map((r) => r.from));
  FIXED.forEach(({ from }) => {
    let others = [`${from}/`, `${from}/*`];
    if (from.endsWith('/*')) others = [from.slice(0, -2)];
    else if (from.endsWith('/')) others = [from.slice(0, -1)];
    assert.ok(others.some((f) => froms.has(f)), `build/redirects.txt: ${from} needs ${others[0]}`);
  });
});

test('build/redirects.txt serves /feed/ before it redirects /feed', () => {
  const at = (from) => FIXED.findIndex((r) => r.from === from);
  assert.deepEqual(FIXED[at('/feed/')], { from: '/feed/', to: '/feed.xml', status: 200 });
  assert.deepEqual(FIXED[at('/feed')], { from: '/feed', to: '/feed/', status: 301 });
  assert.ok(at('/feed/') < at('/feed'));
});

test('build/redirects.txt keeps the old WordPress URLs', () => {
  const has = (from, to, status = 301) => assert.ok(
    FIXED.some((r) => r.from === from && r.to === to && r.status === status),
    `build/redirects.txt: missing ${from} ${to} ${status}`,
  );
  has('/pravicy', '/privacy/');
  ['/feed/atom', '/feed/rss', '/rss'].forEach((from) => has(from, '/feed/'));
  has('/comments/feed', '/');
  has('/news/:slug/feed', '/news/:slug/');
  ['tag', 'author'].forEach((k) => has(`/news/${k}/*`, '/news/'));
  ['sitemap_index', 'post-sitemap', 'page-sitemap', 'category-sitemap', 'post_tag-sitemap',
    'author-sitemap', 'wp-sitemap'].forEach((name) => has(`/${name}.xml`, '/sitemap.xml'));
  has('/page/*', '/');
  has('/page', '/');
});

test('old WordPress URLs with no value stay 404 (card A76j6HTh)', () => {
  ['/news/feed', '/news/page/2/', '/category/x/', '/tag/x/', '/author/x/', '/news/x/embed/',
    '/wp-json/', '/xmlrpc.php', '/wp-login.php'].forEach((from) => {
    assert.equal(hitsFixed(from, FROMS), undefined, from);
  });
  assert.ok(hitsFixed('/page/2/', FROMS));
});

test('the generated _redirects keeps the host limits and the order', () => {
  const cms = parseRules(fs.readFileSync(path.join(root, 'content', 'redirects.json'), 'utf8'));
  const lines = render(cms, FIXED).split('\n').filter((l) => l && !l.startsWith('#'));
  const dynamic = lines.map((l) => /[*:]/.test(l.split(' ')[0]));
  assert.ok(dynamic.indexOf(true) > dynamic.lastIndexOf(false), 'a static line after a dynamic');
  assert.ok(dynamic.filter((d) => !d).length <= 2000, 'more than 2,000 static rules');
  assert.ok(dynamic.filter(Boolean).length <= 100, 'more than 100 dynamic rules');
  lines.forEach((l) => {
    assert.ok(l.length <= 1000, `line longer than 1,000 characters: ${l.slice(0, 50)}`);
    assert.match(l, / (200|301|302|303|307|308)$/, l);
  });
});

test('no static fixed "from" is a live file on the site', () => {
  const exists = onDisk(root);
  FIXED.filter((r) => !/[*:]/.test(r.from)).forEach(({ from }) => {
    assert.ok(!exists(from), `build/redirects.txt: ${from} is a live page or file`);
  });
});

test('pruneNews deletes stale news folders only', () => {
  const dir = tempSite({
    'news/keep/index.html': 'k',
    'news/old/index.html': 'o',
    'news/notes.txt': 'n',
    'old/index.html': 'x',
    'content/news/old.md': 'm',
  });
  pruneNews(dir, [{ slug: 'keep' }]);
  assert.ok(fs.existsSync(path.join(dir, 'news/keep/index.html')));
  assert.ok(!fs.existsSync(path.join(dir, 'news/old')));
  assert.ok(fs.existsSync(path.join(dir, 'news/notes.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'old/index.html')));
  assert.ok(fs.existsSync(path.join(dir, 'content/news/old.md')));
});

test('a stale news folder does not block the auto rule: prune runs first', () => {
  const dir = tempSite({
    'news/old/index.html': '',
    'news/new/index.html': '',
    'content/redirects.json': '{"redirects":[]}',
    'build/redirects.txt': '',
  });
  const posts = [{ filename: 'old', slug: 'new' }];
  pruneNews(dir, posts);
  writeRedirects(dir, posts);
  const out = fs.readFileSync(path.join(dir, '_redirects'), 'utf8');
  assert.match(out, /\n\/news\/old\/ \/news\/new\/ 301\n$/);
});

test('writeRedirects throws with every bad rule named', () => {
  const dir = tempSite({
    'index.html': '',
    'content/redirects.json': JSON.stringify({
      redirects: [{ from: '/x', to: '/missing/' }, { from: 'bad', to: '/' }],
    }),
    'build/redirects.txt': '',
  });
  assert.throws(() => writeRedirects(dir, []), (e) => /"\/x -> \/missing\/"/.test(e.message)
    && /"bad -> \/"/.test(e.message));
  assert.ok(!fs.existsSync(path.join(dir, '_redirects')));
});

function fixedSite(fixed, cms = []) {
  const files = {
    'index.html': '',
    'news/new/index.html': '',
    'content/redirects.json': JSON.stringify({ redirects: cms }),
  };
  if (fixed !== undefined) files['build/redirects.txt'] = fixed;
  return tempSite(files);
}

test('writeRedirects writes the fixed rules around the CMS and news rules', () => {
  const dir = fixedSite('# c\n/s /news/new/ 301\n/d/* / 301\n', [{ from: '/c', to: '/' }]);
  writeRedirects(dir, [{ filename: 'old', slug: 'new' }]);
  assert.equal(
    fs.readFileSync(path.join(dir, '_redirects'), 'utf8').split('\n').slice(1).join('\n'),
    '/s /news/new/ 301\n/c / 301\n/c/ / 301\n/news/old /news/new/ 301\n'
      + '/news/old/ /news/new/ 301\n/d/* / 301\n',
  );
});

test('writeRedirects fails when a CMS rule hits a fixed rule and names the file', () => {
  const fixed = '/s / 301\n/d/* / 301\n/n/:slug/f /n/:slug/ 301\n';
  [['/s/', 'build/redirects.txt'], ['/d/x', 'build/redirects.txt'],
    ['/n/a/f', 'build/redirects.txt']].forEach(([from, file]) => {
    const dir = fixedSite(fixed, [{ from, to: '/' }]);
    const named = (e) => e.message.includes(`matches a rule in ${file}`);
    assert.throws(() => writeRedirects(dir, []), named, from);
  });
});

test('writeRedirects fails on a bad line or a missing build/redirects.txt', () => {
  const bad = fixedSite('# c\n/a / 404\n');
  assert.throws(() => writeRedirects(bad, []), /build\/redirects\.txt line 2: /);
  assert.throws(() => writeRedirects(fixedSite(undefined), []), /build\/redirects\.txt/);
});
