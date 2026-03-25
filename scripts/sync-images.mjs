import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_ROOT = path.resolve("src", "assets", "images");
const VARIANT_WIDTHS = [768, 1200];
const WEBP_QUALITY = 68;
const WEBP_MAX_DIMENSION = 16383;

async function* walk(dir) {
  for (const dirent of await fs.readdir(dir, { withFileTypes: true })) {
    const entry = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(entry);
    } else {
      yield entry;
    }
  }
}

function isVariant(file) {
  return /-(768|1200)\.webp$/i.test(file) || /-\d+w(?:-\d+)?\.webp$/i.test(file);
}

function isSource(file) {
  return /\.(png|jpe?g|jfif|webp)$/i.test(file) && !isVariant(file);
}

function splitFile(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const name = path.basename(file, ext);
  return { dir, ext: ext.toLowerCase(), name };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeWebpVariant(sourceBuffer, sourcePath, width, quality) {
  const { dir, name } = splitFile(sourcePath);
  const out = path.join(dir, `${name}-${width}.webp`);

  await sharp(sourceBuffer, { unlimited: true })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toFile(out);

  return out;
}

async function writeCanonicalWebp(sourceBuffer, sourcePath, quality) {
  const { dir, ext, name } = splitFile(sourcePath);
  if (ext === ".webp") return sourcePath;

  const metadata = await sharp(sourceBuffer, { unlimited: true }).metadata();
  if (
    (metadata.width && metadata.width > WEBP_MAX_DIMENSION) ||
    (metadata.height && metadata.height > WEBP_MAX_DIMENSION)
  ) {
    return sourcePath;
  }

  const out = path.join(dir, `${name}.webp`);
  await sharp(sourceBuffer, { unlimited: true })
    .webp({ quality, effort: 5 })
    .toFile(out);
  return out;
}

async function removeLegacyVariants(root) {
  let removed = 0;

  for await (const file of walk(root)) {
    if (!/-\d+w(?:-\d+)?\.webp$/i.test(file)) continue;
    await fs.unlink(file).catch(() => {});
    removed++;
  }

  return removed;
}

async function resolveTargets(args) {
  if (!args.length) return [DEFAULT_ROOT];

  const targets = [];
  for (const raw of args) {
    const target = path.resolve(raw);
    try {
      await fs.access(target);
      targets.push(target);
    } catch {
      console.warn(`Skipping missing path: ${raw}`);
    }
  }

  return targets.length ? targets : [DEFAULT_ROOT];
}

async function main() {
  const targets = await resolveTargets(process.argv.slice(2));

  let canonicalWritten = 0;
  let variantsWritten = 0;
  let skipped = 0;
  let cleaned = 0;

  for (const target of targets) {
    const stat = await fs.stat(target);
    const files = stat.isDirectory() ? walk(target) : [target];

    for await (const file of files) {
      if (!isSource(file)) {
        skipped++;
        continue;
      }

      const buffer = await fs.readFile(file);
      const canonical = await writeCanonicalWebp(buffer, file, WEBP_QUALITY);
      if (canonical !== file) canonicalWritten++;

      const variantSource = canonical === file ? buffer : await fs.readFile(canonical);
      const variantBase = splitFile(canonical).name;
      for (const width of VARIANT_WIDTHS) {
        const out = path.join(path.dirname(canonical), `${variantBase}-${width}.webp`);
        const exists = await fileExists(out);
        await writeWebpVariant(variantSource, canonical, width, WEBP_QUALITY);
        if (!exists) variantsWritten++;
      }
    }

    if (stat.isDirectory()) {
      cleaned += await removeLegacyVariants(target);
    }
  }

  console.log(`Canonical .webp written: ${canonicalWritten}`);
  console.log(`Responsive variants written: ${variantsWritten}`);
  console.log(`Legacy -900w variants removed: ${cleaned}`);
  console.log(`Skipped non-source files: ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
