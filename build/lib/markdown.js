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
  /* "- " or "* ": the CMS rich-text editor saves lists with "* ". */
  if (/^[-*] /m.test(b)) {
    const items = b.split('\n')
      .filter((l) => /^[-*] /.test(l))
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

/* ---------- tiny front-matter + markdown parser ---------- */
function parseFrontMatter(src, file = '') {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`bad front matter: ${file}`);
  const fm = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([a-z][a-z0-9_]*):\s*("(?:[^"\\]|\\.)*"|.*)$/);
    if (kv) {
      let v = kv[2].trim();
      /* Block scalar (Decap writes `|-`, or `>-` past 80 chars). Only `schema` uses it, as
         JSON: `>` joins with a space, the blank lines drop, and the end is trimmed. */
      const block = v.match(/^([|>])[-+]?$/);
      if (!block) {
        /* A CMS save folds a long plain or quoted value onto indented lines: join with a space. */
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
          i += 1;
          v = `${v} ${lines[i].trim()}`;
        }
      }
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
      if (block) {
        const rest = [];
        while (i + 1 < lines.length && /^(\s|$)/.test(lines[i + 1])) {
          i += 1;
          rest.push(lines[i]);
        }
        const indent = (rest.find((l) => l.trim()) || '').match(/^\s*/)[0].length;
        const text = rest.map((l) => l.slice(indent));
        v = (block[1] === '|' ? text.join('\n') : text.filter((l) => l.trim()).join(' ')).trimEnd();
      }
      fm[kv[1]] = v;
    }
  }
  return { fm, body: m[2].trim() };
}

/* A page in content/pages/<name>.md, as the page modules read a content/pages/<name>.json:
   flat front matter like a news post (h1, seo_title, og_title, description, canonical,
   noindex, schema) and a markdown body whose first line "# Title" is the page title. The CMS
   preview passes the same flat fields, with the body. */
function markdownPage(fm, body = '') {
  /* The CMS preview passes the body with a leading newline. */
  const text = String(body).trim();
  const first = text.match(/^#\s+(.+)(?:\n+|$)/);
  return {
    h1: fm.h1 || '',
    title: first ? first[1].trim() : '',
    body: first ? text.slice(first[0].length) : text,
    seo: {
      title: fm.seo_title || '',
      og_title: fm.og_title || '',
      description: fm.description || '',
      canonical: fm.canonical || '',
      noindex: fm.noindex === true || fm.noindex === 'true',
      schema: fm.schema || '',
    },
  };
}

module.exports = {
  inlineMd, mdToHtml, headingId, parseFrontMatter, markdownPage, SAFE_HREF,
};
