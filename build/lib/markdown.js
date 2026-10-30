const { escAttr } = require('./html');
const { picture } = require('./images');

/* The small markdown of the news posts and the privacy page: ## to #### headings, - lists,
   > quotes, ---, links, images, **bold** and *italic*.

   manifest: build/images.json. The images go through picture(); the markdown keeps the
   original URLs. Finished markup (images, link start tags) waits as a \u0000n\u0000 token,
   so the later rules do not change its attributes. Link schemes other than http(s), mailto
   and tel lose the link and keep the text. */
const SAFE_HREF = /^(?:https?:|mailto:|tel:|[^:]*(?:[/?#]|$))/i;

/* eslint-disable no-control-regex -- NUL marks the tokens */
function inlineMd(s, manifest = {}) {
  const done = [];
  const keep = (html) => `\u0000${done.push(html) - 1}\u0000`;
  return s.replace(/\u0000/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => keep(picture({
      src, alt, slot: 'post',
    }, manifest)))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => (
      SAFE_HREF.test(href.replace(/[\u0000- ]/g, ''))
        ? `${keep(`<a href="${escAttr(href)}">`)}${text}</a>` : text))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u0000(\d+)\u0000/g, (m, i) => done[i]);
}
/* eslint-enable no-control-regex */

/* The id of a heading, for a #fragment link: "Use of data" -> "use-of-data". */
const headingId = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function blockToHtml(b, manifest, ids) {
  if (/^#{2,4}\s/.test(b)) {
    const level = b.match(/^(#{2,4})/)[1].length;
    const text = b.replace(/^#{2,4}\s*/, '');
    const id = ids ? ` id="${headingId(text)}"` : '';
    return `<h${level}${id}>${inlineMd(text, manifest)}</h${level}>\n`;
  }
  if (b === '---') return '<hr />\n';
  if (/^(- )/m.test(b)) {
    const items = b.split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => `<li>${inlineMd(l.slice(2), manifest)}</li>`)
      .join('');
    return `<ul>${items}</ul>\n`;
  }
  if (b.startsWith('> ')) {
    return `<blockquote>${inlineMd(b.replace(/^>\s?/gm, ''), manifest)}</blockquote>\n`;
  }
  const html = inlineMd(b, manifest);
  if (/^<(?:img|picture)\b/.test(html)) return `${html}\n`;
  return `<p>${inlineMd(b.replace(/\n/g, ' '), manifest)}</p>\n`;
}

/* ids: give each heading an id (the privacy page links its contents to them). */
function mdToHtml(md, manifest = {}, { ids = false } = {}) {
  return md.split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => blockToHtml(b, manifest, ids))
    .join('')
    .trim();
}

module.exports = {
  inlineMd, mdToHtml, headingId, SAFE_HREF,
};
