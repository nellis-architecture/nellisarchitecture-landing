const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const parse = (text) => {
  const rules = new Map();
  let current;
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '' || line.startsWith('#')) return;
    if (!/^\s/.test(line)) {
      assert.ok(!rules.has(line), `_headers:${i + 1}: duplicate path ${line}`);
      current = new Map();
      rules.set(line, current);
      return;
    }
    const match = line.match(/^ {2}([A-Za-z-]+): (\S.*)$/);
    assert.ok(match, `_headers:${i + 1}: expected "  Name: value", got "${line}"`);
    assert.ok(current, `_headers:${i + 1}: header before a path`);
    const name = match[1].toLowerCase();
    assert.ok(!current.has(name), `_headers:${i + 1}: duplicate header ${match[1]}`);
    current.set(name, match[2]);
  });
  return rules;
};

/* Two patterns can both match one path when the text before the first "*" of one is a
   prefix of the other's. Enough here: every pattern in this file is "/" or "/x/...". */
const prefixOf = (pattern) => pattern.split('*')[0];
const canOverlap = (a, b) => prefixOf(a).startsWith(prefixOf(b))
  || prefixOf(b).startsWith(prefixOf(a));

/* Cloudflare joins a header that two matching rules both set, so one header name may
   appear on only one of the patterns that a single path can match. */
const assertNoJoinedHeader = (rules) => {
  const patterns = [...rules.keys()];
  patterns.forEach((a, i) => patterns.slice(i + 1).forEach((b) => {
    if (!canOverlap(a, b)) return;
    const shared = [...rules.get(a).keys()].filter((name) => rules.get(b).has(name));
    assert.deepEqual(shared, [], `_headers: ${a} and ${b} both set ${shared.join(', ')}`);
  }));
};

test('parse rejects a header line without indent or colon', () => {
  assert.throws(() => parse('/*\n  X-Frame-Options SAMEORIGIN\n'));
  assert.throws(() => parse('  X-Frame-Options: SAMEORIGIN\n'));
  assert.throws(() => parse('/*\n  A: 1\n  a: 2\n'));
});

test('parse skips # comment lines', () => {
  assert.deepEqual([...parse('# c\n/*\n  A: 1\n').keys()], ['/*']);
});

test('_headers sets the security headers on every path', () => {
  const all = parse(read('_headers')).get('/*');
  assert.ok(all, '_headers: missing /* rule');
  assert.equal(all.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(all.get('x-content-type-options'), 'nosniff');
  assert.equal(all.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(all.get('x-robots-tag'), 'noindex', 'noindex stays until the DNS cutover (card 9)');
});

test('_headers caches uploads and variants for one year, immutable', () => {
  const rules = parse(read('_headers'));
  ['/wp-content/uploads/*', '/wp-content/variants/*'].forEach((pattern) => {
    const rule = rules.get(pattern);
    assert.ok(rule, `_headers: missing ${pattern} rule`);
    assert.match(rule.get('cache-control'), /max-age=31536000/, pattern);
    assert.match(rule.get('cache-control'), /immutable/, pattern);
  });
});

test('_headers makes themes and plugins revalidate', () => {
  const rules = parse(read('_headers'));
  ['/wp-content/themes/*', '/wp-content/plugins/*'].forEach((pattern) => {
    const rule = rules.get(pattern);
    assert.ok(rule, `_headers: missing ${pattern} rule`);
    const cache = rule.get('cache-control');
    assert.equal(cache, 'public, max-age=0, must-revalidate', pattern);
    assert.doesNotMatch(cache, /immutable/, pattern);
  });
});

test('_headers has a Cache-Control rule for every directory in wp-content/', () => {
  const names = fs.readdirSync(path.join(root, 'wp-content'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.ok(names.length > 0, 'wp-content/ holds no directory');
  const rules = parse(read('_headers'));
  names.forEach((name) => {
    const rule = rules.get(`/wp-content/${name}/*`);
    assert.ok(rule, `_headers: missing /wp-content/${name}/* rule`);
    assert.ok(rule.get('cache-control'), `_headers: /wp-content/${name}/* sets no Cache-Control`);
  });
});

test('_headers never sets one header name on two patterns that can match one path', () => {
  assertNoJoinedHeader(parse(read('_headers')));
});

test('canOverlap and assertNoJoinedHeader', () => {
  assert.equal(canOverlap('/*', '/wp-content/themes/*'), true);
  assert.equal(canOverlap('/wp-content/uploads/*', '/wp-content/themes/*'), false);
  assert.throws(() => assertNoJoinedHeader(parse(
    '/wp-content/*\n  Cache-Control: a\n/wp-content/themes/*\n  Cache-Control: b\n',
  )));
});
