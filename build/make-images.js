/*
 * build/make-images.js — writes the responsive image variants and build/images.json.
 *   npm run images
 * Skips an image when its hash and its variant files did not change.
 * Deletes the files in wp-content/variants/ that the manifest does not name,
 * but not after an encode failure and not when wp-content/variants is a symbolic link.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {
  MANIFEST, VARIANTS, hash8, usedImages, readManifest, encodeImage, variantFiles, staleVariants,
  walk,
} = require('./lib/images');

function writeManifest(root, manifest) {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  const text = `${JSON.stringify(sorted, null, 2)}\n`;
  const file = path.join(root, MANIFEST);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return;
  fs.writeFileSync(file, text);
}

function deleteStale(root, manifest, failed, warn) {
  if (failed) {
    warn(`warning: stale delete skipped: ${failed} encodes failed`);
    return 0;
  }
  const dir = path.resolve(root, VARIANTS);
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) {
    warn(`warning: stale delete skipped: ${VARIANTS} is a symbolic link`);
    return 0;
  }
  const files = walk(dir).map((f) => path.relative(root, f).split(path.sep).join('/'));
  const stale = staleVariants(manifest, files);
  stale.forEach((f) => fs.unlinkSync(path.join(root, f)));
  return stale.length;
}

async function main(root = path.join(__dirname, '..'), {
  lib = sharp, encode = encodeImage, log = console.log, warn = console.warn,
} = {}) {
  const old = readManifest(root);
  const manifest = {};
  const used = usedImages(root);
  let made = 0;
  let failed = 0;
  await used.reduce((chain, p, i) => chain.then(async () => {
    const file = path.join(root, p);
    if (!fs.existsSync(file)) {
      warn(`warning: missing upload ${p}`);
      return;
    }
    const entry = old[p];
    const same = entry && entry.hash === hash8(fs.readFileSync(file))
      && variantFiles({ [p]: entry }).every((f) => fs.existsSync(path.join(root, f)));
    if (same) {
      manifest[p] = entry;
      return;
    }
    try {
      manifest[p] = await encode(lib, root, p);
      made += 1;
      log(`${i + 1}/${used.length} ${p}`);
      writeManifest(root, { ...old, ...manifest });
    } catch (error) {
      failed += 1;
      warn(`warning: ${p}: ${error.message}`);
    }
  }), Promise.resolve());
  writeManifest(root, manifest);

  const deleted = deleteStale(root, manifest, failed, warn);
  const keep = variantFiles(manifest);
  const bytes = keep.reduce((sum, f) => sum + fs.statSync(path.join(root, f)).size, 0);
  log(`images: ${Object.keys(manifest).length} images, ${made} made, `
    + `${deleted} stale deleted; `
    + `${keep.length} variant files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
}

module.exports = { main };

if (require.main === module) main();
