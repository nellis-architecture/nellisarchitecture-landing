const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  navSite, navPlain, navPost, follow,
} = require('../build/lib/chrome');

const NAV = [
  { label: 'Projects', link: '/projects/' },
  { label: 'Studio', link: '/studio/' },
  { label: 'People', link: '/people/' },
  { label: 'News', link: '/news/' },
  { label: 'Contact', link: '/contact/' },
];

const FOLLOW = [
  { label: 'Instagram', link: 'https://www.instagram.com/nellis.architecture/' },
  { label: 'LinkedIn', link: 'https://www.linkedin.com/company/nellis-architecture/' },
  { label: 'YouTube', link: 'https://www.youtube.com/@NellisArchitecture' },
];

const P14 = ' '.repeat(14);
const P16 = ' '.repeat(16);
const P28 = ' '.repeat(28);
const P32 = ' '.repeat(32);
const P10 = ' '.repeat(10);
const P12 = ' '.repeat(12);

test('navSite renders the shape A items with the hook class and the margin style', () => {
  assert.equal(navSite(NAV), `              <li class="nav-item">
                <a href="/projects/" class="projectPage" style="margin-left: 0;">Projects</a>
              </li>
              <li class="nav-item">
                <a href="/studio/" class="studioPage" style="margin-left: 0;">Studio</a>
              </li>
              <li class="nav-item">
                <a href="/people/" class="projectPeople" style="margin-left: 0;">People</a>
              </li>
              <li class="nav-item">
                <a href="/news/" class="newsPage" style="margin-left: 0;">News</a>
              </li>
              <li class="nav-item">
                <a href="/contact/" class="contactPage" style="margin-left: 0;">Contact</a>
              </li>`);
});

test('navPlain puts nav-item on the anchor and the hook on the li', () => {
  assert.equal(navPlain(NAV), `                            <a href="/projects/" class="nav-item">
                                <li class="projectPage">Projects</li>
                            </a>
                            <a href="/studio/" class="nav-item">
                                <li class="studioPage">Studio</li>
                            </a>
                            <a href="/people/" class="nav-item">
                                <li class="projectPeople">People</li>
                            </a>
                            <a href="/news/" class="nav-item">
                                <li class="newsPage">News</li>
                            </a>
                            <a href="/contact/" class="nav-item">
                                <li class="contactPage">Contact</li>
                            </a>`);
});

test('navPost puts the newsPage hook on the li and no class on the anchor', () => {
  assert.equal(navPost(NAV), `              <li class="nav-item">
                <a href="/projects/" class="projectPage">Projects</a>
              </li>
              <li class="nav-item">
                <a href="/studio/" class="studioPage">Studio</a>
              </li>
              <li class="nav-item">
                <a href="/people/" class="projectPeople">People</a>
              </li>
              <li class="nav-item newsPage">
                <a href="/news/">News</a>
              </li>
              <li class="nav-item">
                <a href="/contact/" class="contactPage">Contact</a>
              </li>`);
});

test('the nav renderers omit the class attribute for an unmapped link', () => {
  const item = { label: 'X', link: '/x/' };
  assert.equal(navSite([item]), `${P14}<li class="nav-item">\n`
    + `${P16}<a href="/x/" style="margin-left: 0;">X</a>\n${P14}</li>`);
  assert.equal(navPlain([item]), `${P28}<a href="/x/" class="nav-item">\n`
    + `${P32}<li>X</li>\n${P28}</a>`);
  assert.equal(navPost([item]), `${P14}<li class="nav-item">\n`
    + `${P16}<a href="/x/">X</a>\n${P14}</li>`);
  [navSite([item]), navPost([item])].forEach((out) => {
    assert.ok(!out.match(/<a [^>]*class="/), out);
  });
  assert.ok(!navPlain([item]).includes('<li class="'), navPlain([item]));
});

test('the nav renderers escape the label and the link and keep $& literal', () => {
  const item = { label: 'A <b> & $&', link: '/a/?x=1&y=$&' };
  const href = '/a/?x=1&amp;y=$&amp;';
  const label = 'A &lt;b&gt; &amp; $&amp;';
  assert.equal(navSite([item]), `${P14}<li class="nav-item">\n`
    + `${P16}<a href="${href}" style="margin-left: 0;">${label}</a>\n${P14}</li>`);
  assert.equal(navPlain([item]), `${P28}<a href="${href}" class="nav-item">\n`
    + `${P32}<li>${label}</li>\n${P28}</a>`);
  assert.equal(navPost([item]), `${P14}<li class="nav-item">\n`
    + `${P16}<a href="${href}">${label}</a>\n${P14}</li>`);
});

test('follow renders the block from the items', () => {
  const link = (href, text) => `${P12}<a target="_blank" href="${href}">${text}</a>`;
  assert.equal(follow(FOLLOW), [
    `${P10}<div class="follow">`,
    `${P12}<span class="name">Follow:</span>`,
    link('https://www.instagram.com/nellis.architecture/', 'Instagram'),
    link('https://www.linkedin.com/company/nellis-architecture/', 'LinkedIn'),
    link('https://www.youtube.com/@NellisArchitecture', 'YouTube'),
    `${P10}</div>`,
  ].join('\n'));
  assert.equal(follow([FOLLOW[0]]), [
    `${P10}<div class="follow">`,
    `${P12}<span class="name">Follow:</span>`,
    link('https://www.instagram.com/nellis.architecture/', 'Instagram'),
    `${P10}</div>`,
  ].join('\n'));
  const mixed = follow([{ label: 'X & Y', link: 'https://e.com/?a=1&b=2' }]);
  assert.equal(
    mixed.split('\n')[2],
    `${P12}<a target="_blank" href="https://e.com/?a=1&amp;b=2">X &amp; Y</a>`,
  );
});
