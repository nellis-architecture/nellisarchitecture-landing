const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  decode, locs, pathOf, headOf, headDiff, pool, isPost, report, liveUrls, main,
} = require('../build/live-check');

/* A fake reader: the text of each URL, or a bot challenge page for any other URL. */
const reader = (pages) => async (url) => pages[url] ?? '<html>Checking your browser</html>';

test('liveUrls collects page and image URLs from every sitemap in the index', async () => {
  const urls = await liveUrls('https://x.com', reader({
    'https://x.com/sitemap_index.xml':
      '<sitemap><loc>https://x.com/post-sitemap.xml</loc></sitemap>',
    'https://x.com/post-sitemap.xml': '<url><loc>https://x.com/news/a/</loc>'
      + '<image:loc>https://x.com/a.jpg</image:loc></url>'
      + '<url><loc>https://x.com/news/a/</loc></url>',
  }));
  assert.deepEqual(urls, { pages: ['https://x.com/news/a/'], images: ['https://x.com/a.jpg'] });
});

test('liveUrls fails when the sitemaps give no page URL, so the check cannot pass', async () => {
  await assert.rejects(liveUrls('https://x.com', reader({})), /no page URLs/);
});

test('main stops when --base has no URL', async () => {
  await assert.rejects(main(['--base']), /--base needs a URL/);
});

test('decode turns named and numeric entities into text', () => {
  assert.equal(decode('Dubai&#8217;s &amp; &quot;A&quot; &#x2013; &hellip;'), 'Dubai’s & "A" – …');
  assert.equal(decode('&unknown;'), '&unknown;');
});

test('locs reads page and image URLs from a Yoast sitemap', () => {
  const xml = '<url><loc>https://x.com/news/a/</loc><image:image>'
    + '<image:loc>https://x.com/wp-content/uploads/a.jpg</image:loc></image:image></url>'
    + '<url><loc> https://x.com/?p=1&amp;q=2 </loc></url>';
  assert.deepEqual(locs(xml), ['https://x.com/news/a/', 'https://x.com/?p=1&q=2']);
  assert.deepEqual(locs(xml, 'image:loc'), ['https://x.com/wp-content/uploads/a.jpg']);
});

test('pathOf keeps the path and the query, not the host', () => {
  assert.equal(pathOf('https://nellisarchitecture.com/news/a/'), '/news/a/');
  assert.equal(pathOf('https://nellisarchitecture.com/?p=1997'), '/?p=1997');
});

test('headOf reads title, meta description and og:title from the head only', () => {
  const html = '<head><!-- <title></title> --><title>A &amp; B\n | Nellis</title>'
    + '<meta name="description" content="Desc &#8211; one" />'
    + '<meta content="OG" property="og:title"></head>'
    + '<body><title>svg</title><meta name="description" content="body"></body>';
  assert.deepEqual(headOf(html), {
    title: 'A & B | Nellis', description: 'Desc – one', ogTitle: 'OG',
  });
  assert.deepEqual(headOf('<html></html>'), { title: '', description: '', ogTitle: '' });
});

test('headOf keeps an apostrophe or a quote that sits inside the content value', () => {
  const html = '<head><meta name="description" content="The world\'s best">'
    + '<meta property=\'og:title\' content=\'Say "hi"\'></head>';
  assert.equal(headOf(html).description, 'The world\'s best');
  assert.equal(headOf(html).ogTitle, 'Say "hi"');
});

test('headDiff lists only the fields whose text differs', () => {
  const live = { title: 'T', description: 'D', ogTitle: 'O' };
  assert.deepEqual(headDiff(live, { ...live }), []);
  assert.deepEqual(
    headDiff(live, { ...live, ogTitle: 'X' }),
    [{
      key: 'ogTitle', live: 'O', local: 'X', brand: false,
    }],
  );
});

test('headDiff marks a difference in the trailing site name only', () => {
  const [title, og] = headDiff(
    { title: 'Shade', ogTitle: 'Shade - Nellis Architecture' },
    { title: 'Shade | Nellis Architecture', ogTitle: 'Other' },
  );
  assert.equal(title.brand, true);
  assert.equal(og.brand, false);
  const doubled = 'A | Nellis Architecture | Nellis Architecture';
  const [twice] = headDiff({ title: 'A' }, { title: doubled });
  assert.equal(twice.brand, false);
});

test('pool runs every item, no more than size at a time, and keeps the order', async () => {
  let running = 0;
  let most = 0;
  const out = await pool([5, 1, 4, 2, 3], 2, async (n) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => {
      setTimeout(resolve, n);
    });
    running -= 1;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30]);
  assert.equal(most, 2);
});

test('isPost is true only for a news post URL', () => {
  assert.equal(isPost('https://x.com/news/a-post/'), true);
  assert.equal(isPost('https://x.com/news/'), false);
  assert.equal(isPost('https://x.com/news/category/a/b/'), false);
  assert.equal(isPost('https://x.com/studio/'), false);
});

test('report lists the missing URLs and each head difference', () => {
  const out = report('http://localhost:8000', {
    pages: 2,
    images: 1,
    posts: 1,
    missing: [{ path: '/wp-content/uploads/a.jpg', status: 404 }],
    diffs: [{
      path: '/news/a/',
      fields: [
        {
          key: 'title', live: 'A', local: 'A | Nellis Architecture', brand: true,
        },
        {
          key: 'ogTitle', live: 'L', local: 'N', brand: false,
        },
      ],
    }],
  });
  assert.match(out, /Missing on the new site \(1\):\n {2}404 \/wp-content\/uploads\/a\.jpg/);
  assert.match(out, /differ only by the site name at the end: 1\n/);
  assert.match(out, /News head text differences \(1 of 1 posts\):\n {2}\/news\/a\/\n {4}ogTitle\n/);
  assert.match(out, / {6}live: L\n {6}new: {2}N$/);
});
