// scripts/gen-images.mjs
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

/**
 * Walk a directory recursively and return absolute file paths.
 */
async function* walk(dir) {
  for (const dirent of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) yield* walk(res);
    else yield res;
  }
}

/**
 * True if file looks like one of our *target* variants already (-768.webp or -1200.webp).
 */
function isTargetVariant(fp) {
  return /-(768|1200)\.webp$/i.test(fp);
}

/**
 * True if file looks like an *old/bad* variant (e.g. -900w-768.webp, -600w.webp, etc.)
 */
function isWeirdVariant(fp) {
  return /-\d+w(?:-\d+)?\.webp$/i.test(fp);
}

/**
 * Return {dir, name, ext, base} for convenience.
 */
function split(fp) {
  const dir = path.dirname(fp);
  const ext = path.extname(fp);
  const base = path.basename(fp, ext);
  return { dir, name: base, ext, base: path.basename(fp) };
}

/**
 * Decide whether a file should be treated as a "source/original" to generate from:
 *  - must be .webp, .png, .jpg, .jpeg
 *  - must NOT already be a target variant (-768/-1200)
 *  - must NOT be a weird variant (-900w-768.webp, etc.)
 */
function isSource(fp) {
  const okExt = /\.(webp|png|jpe?g)$/i.test(fp);
  return okExt && !isTargetVariant(fp) && !isWeirdVariant(fp);
}

async function ensureDir(d) {
  await fs.mkdir(d, { recursive: true });
}

async function main() {
  const ROOT = path.resolve("src", "assets", "images");
  try { await fs.access(ROOT); } catch {
    console.error(`✖ No images directory at ${ROOT}`);
    process.exit(1);
  }

  let made = 0, skipped = 0;

  for await (const fp of walk(ROOT)) {
    if (!isSource(fp)) { skipped++; continue; }

    const { dir, name } = split(fp);
    const out768 = path.join(dir, `${name}-768.webp`);
    const out1200 = path.join(dir, `${name}-1200.webp`);

    // Read once
    const buf = await fs.readFile(fp);
    const img = sharp(buf, { unlimited: true });

    // Generate both sizes (overwrite if exist to keep things consistent)
    await ensureDir(dir);

    await img
      .clone()
      .resize({ width: 768, withoutEnlargement: true })
      .webp({ quality: 62 })
      .toFile(out768);

    await img
      .clone()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 62 })
      .toFile(out1200);

    made += 2;
    console.log(`✔ ${name} → -768.webp, -1200.webp`);
  }

  console.log(`\nDone. Created ${made} variants. Skipped ${skipped} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
