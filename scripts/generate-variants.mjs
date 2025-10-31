// scripts/generate-variants.mjs
// Create responsive WebP variants: -768.webp and -1200.webp
// Usage:
//   node scripts/generate-variants.mjs                         # scan common folders
//   node scripts/generate-variants.mjs --file "public/images/projects/WWBC/hero-2880x3874.jpg"
//   node scripts/generate-variants.mjs --glob "public/images/projects/**/*.{png,jpg,jpeg,webp}"

import fs from "fs";
import path from "path";
import sharp from "sharp";

// ---- config ----
const SIZES = [768, 1200];       // matches <picture> in slug.astro
const QUALITY = 62;              // balanced for mobile (you can tweak)
const GLOBS_DEFAULT = [
  "public/images/**/*.{png,jpg,jpeg,webp}",
  "src/assets/images/**/*.{png,jpg,jpeg,webp}",
];

// simple glob-less directory crawl (keeps deps small)
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function listFilesByPatterns(patterns) {
  const roots = new Set();
  const exts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  for (const pattern of patterns) {
    // minimal pattern support: "<root>/**/<exts>"
    const m = pattern.match(/^(.*)\/\*\*\/\*\.\{(.*)\}$/i);
    if (m) {
      const root = m[1];
      const extlist = m[2].split(",").map((s) => "." + s.trim().toLowerCase());
      for (const ex of extlist) exts.add(ex);
      roots.add(root);
    } else {
      // direct file
      roots.add(pattern);
    }
  }
  const out = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const stat = fs.statSync(r);
    if (stat.isFile()) {
      out.push(r);
    } else if (stat.isDirectory()) {
      for (const f of walk(r)) {
        if (exts.has(path.extname(f).toLowerCase())) out.push(f);
      }
    }
  }
  return out;
}

function variantPath(file, size) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  return path.join(dir, base.replace(/\.(png|jpe?g|webp)$/i, `-${size}.webp`));
}

async function makeVariant(input, size) {
  const out = variantPath(input, size);
  if (fs.existsSync(out)) return { out, skipped: true };
  const buf = fs.readFileSync(input);
  const image = sharp(buf, { failOn: "none" });
  const meta = await image.metadata();
  // avoid upscaling tiny images
  const target = meta.width && meta.width < size ? meta.width : size;
  await image
    .resize({ width: target, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(out);
  return { out, skipped: false };
}

async function run() {
  const args = process.argv.slice(2);
  let singleFile = null;
  let customGlob = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file") singleFile = args[i + 1];
    if (args[i] === "--glob") customGlob = args[i + 1];
  }

  let targets = [];
  if (singleFile) {
    if (!fs.existsSync(singleFile)) {
      console.error("File not found:", singleFile);
      process.exit(1);
    }
    targets = [singleFile];
  } else if (customGlob) {
    // Basic support: treat it as a file or a folder root
    if (fs.existsSync(customGlob)) {
      const stat = fs.statSync(customGlob);
      targets = stat.isFile()
        ? [customGlob]
        : listFilesByPatterns([path.join(customGlob, "/**/*.{png,jpg,jpeg,webp}")]);
    } else {
      // fall back to defaults if not found
      targets = listFilesByPatterns(GLOBS_DEFAULT);
    }
  } else {
    targets = listFilesByPatterns(GLOBS_DEFAULT);
  }

  if (!targets.length) {
    console.log("No images found.");
    return;
  }

  let created = 0, skipped = 0;
  for (const file of targets) {
    // ignore already-generated variants
    if (/-\d+\.webp$/i.test(file)) continue;

    for (const size of SIZES) {
      try {
        const res = await makeVariant(file, size);
        if (res.skipped) skipped++;
        else created++;
      } catch (e) {
        console.warn("Failed to make variant for", file, "size", size, e?.message || e);
      }
    }
  }

  console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
