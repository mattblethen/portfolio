// scripts/optimize-images.mjs
// Convert big PNG/JPG previews to 900px-wide WebP beside the source.
// Usage: node scripts/optimize-images.mjs "public/images/**/*.png" "src/assets/images/**/*.png"

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';          // ✅ modern glob v10+ named export
import sharp from 'sharp';

const patterns = process.argv.slice(2);
if (!patterns.length) {
  console.error('Usage: node scripts/optimize-images.mjs "<glob1>" "<glob2>"');
  process.exit(1);
}

const files = (
  await Promise.all(
    patterns.map(p => glob(p, { nodir: true }))
  )
).flat();

if (!files.length) {
  console.log('No images matched.');
  process.exit(0);
}

for (const file of files) {
  try {
    const out = path.join(
      path.dirname(file),
      path.basename(file).replace(/\.(png|jpg|jpeg)$/i, '-900w.webp')
    );

    await sharp(file)
      .resize({ width: 900, withoutEnlargement: true })
      .webp({ quality: 64 })
      .toFile(out);

    const { size } = await fs.stat(out);
    console.log('→', out, Math.round(size / 1024), 'KiB');
  } catch (err) {
    console.warn('⚠️  Skip', file, err.message);
  }
}
