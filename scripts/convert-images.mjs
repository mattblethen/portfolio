// scripts/convert-images.mjs
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "src", "assets", "images");

const exts = new Set([".png", ".jpg", ".jpeg"]);
const webpOpts = { quality: 68 }; // tweak if you want smaller/larger

async function walk(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else if (exts.has(path.extname(e.name).toLowerCase())) {
      const webpPath = p.replace(/\.(png|jpe?g)$/i, ".webp");
      // Skip if already exists
      if (fs.existsSync(webpPath)) continue;

      try {
        await sharp(p).webp(webpOpts).toFile(webpPath);
        console.log("→", path.relative(ROOT, webpPath));
      } catch (err) {
        console.error("x Failed:", p, err?.message || err);
      }
    }
  }
}

if (!fs.existsSync(ROOT)) {
  console.error("Images folder not found:", ROOT);
  process.exit(1);
}

walk(ROOT).then(() => console.log("Done."));
