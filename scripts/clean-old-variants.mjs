// scripts/clean-old-variants.mjs
import fs from "fs/promises";
import path from "path";

async function* walk(dir) {
  for (const dirent of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) yield* walk(res);
    else yield res;
  }
}

function isWeirdVariant(fp) {
  return /-\d+w(?:-\d+)?\.webp$/i.test(fp);
}

async function main() {
  const ROOT = path.resolve("src", "assets", "images");
  let removed = 0;
  for await (const fp of walk(ROOT)) {
    if (isWeirdVariant(fp)) {
      await fs.unlink(fp).catch(() => {});
      console.log("🗑  removed", path.relative(process.cwd(), fp));
      removed++;
    }
  }
  console.log(`\nCleanup complete. Removed ${removed} weird variants.`);
}
main();
