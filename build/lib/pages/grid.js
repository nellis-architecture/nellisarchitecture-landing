const {
  escText, escAttr, fill, loadPartial,
} = require('../html');
const {
  CATEGORIES, CATEGORY_KEYS, inCategory, listImage, cardAlt,
} = require('../projects');
const { picture, smallSrc } = require('../images');

const INDENT = ' '.repeat(18);
const TYPE_CODE = { commercial: 0, residential: 1 };
/* The theme also asks for these two files. They stay without items. */
const EMPTY_FILTERS = { all_1: 'all / residential', empty_1: ' / residential' };

const heading = (text) => '<div class="howCategoryActive"><span>OUR PROJECTS:</span> <br> '
  + `<span>${text} </span> </div>`;

function itemTokens(e, src, slot, manifest) {
  return {
    HREF: escAttr(e.url),
    NAME_ATTR: escAttr(e.name),
    IMG: picture({
      src, alt: cardAlt(e), slot, cls: 'project__item-img',
    }, manifest),
    NAME: escText(e.name),
    AREA: escText(e.p.area),
    REGION: escText(e.p.region),
  };
}

/* The grid of Home and the project pages. current: the URL of the open project. */
function grid(projects, { slot = 'card', current = '', manifest = {} } = {}) {
  const tpl = loadPartial('grid-item');
  return projects.map((e) => {
    const open = e.url === current;
    return fill(tpl, {
      ...itemTokens(e, e.p.card_image, slot, manifest),
      ITEM_CLASS: current && !open ? ' zeroOpac' : '',
      ARIA_CURRENT: open ? ' aria-current="page"' : '',
      PL_CLASS: open ? ' PLoppened' : '',
    });
  }).join(`\n${INDENT}`);
}

function filterFile(projects, cat, type, manifest) {
  const tpl = loadPartial('filter-item');
  const items = projects.filter((e) => inCategory(e, cat) && e.p.type === type)
    .map((e) => fill(tpl, itemTokens(e, listImage(e), 'card', manifest)));
  return heading(`${CATEGORIES[cat].label.toLowerCase()} / ${type}`) + items.join('');
}

/* <name> of data/filters/<name>.html -> text. js/static-backend.js fetches these files. */
function filterFiles(projects, manifest) {
  const files = {};
  CATEGORY_KEYS.forEach((cat) => Object.entries(TYPE_CODE).forEach(([type, code]) => {
    files[`${cat.replace('-', '_')}_${code}`] = filterFile(projects, cat, type, manifest);
  }));
  Object.entries(EMPTY_FILTERS).forEach(([name, text]) => {
    files[name] = heading(text);
  });
  return files;
}

/* The text of data/search.json (the search box of the theme). */
function searchJson(projects, manifest) {
  return JSON.stringify(projects.map((e) => ({
    title: e.name,
    project_type_set: (e.p.facts || []).flatMap((f) => [f.label, f.value]),
    minImg: smallSrc(listImage(e), manifest),
  })), null, 2);
}

module.exports = { grid, filterFiles, searchJson };
