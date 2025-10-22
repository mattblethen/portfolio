// capture-inli10prints.js — Desktop stitched (header+section), Mobile menu UX, Latest blog & product
// ESM compatible (your package.json has "type":"module")
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import sharp from "sharp";

const OUTDIR = path.join(process.cwd(), "public", "images", "portfolio", "inli10prints");
const BG = { r: 15, g: 15, b: 16, alpha: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
async function deepScroll(page, steps = 8, pause = 220) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.9)));
    await sleep(pause);
  }
}

async function hideOverlays(page) {
  await page.addStyleTag({ content: `
    [data-cart-drawer], .modal, .overlay, .newsletter, .klaviyo-form,
    iframe[src*="chat"], .chat-widget, .popup { display: none !important; }
  `});
}

// --- Header clip helpers (for stitched desktop images) ---
async function getHeaderClip(page, pad = 0) {
  return await page.evaluate((pad) => {
    const sels = [
      '.announcement', '.announcement-bar', '.announcement-bar__message',
      'header', '.header', '.shopify-section-header', '.site-header'
    ];
    let top = Infinity, bottom = -Infinity, found = false;
    for (const s of sels) {
      document.querySelectorAll(s).forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r || r.height === 0) return;
        found = true;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      });
    }
    const width = document.documentElement.clientWidth || 1440;
    if (!found) return null;
    return { x: 0, y: Math.max(0, top - pad), width, height: Math.max(0, bottom - top + pad * 2) };
  }, pad);
}

async function removeHeaderDOM(page) {
  await page.evaluate(() => {
    const sels = [
      '.announcement', '.announcement-bar', '.announcement-bar__message',
      'header', '.header', '.shopify-section-header', '.site-header'
    ];
    const set = new Set();
    sels.forEach(s => document.querySelectorAll(s).forEach(n => set.add(n)));
    set.forEach(n => n.remove());
  });
}

async function shot(page, selector, file, pad = 10) {
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  const el = await page.$(selector);
  await el.scrollIntoViewIfNeeded();
  await sleep(150);
  const box = await el.boundingBox();
  const vp = page.viewport();
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(vp.width, box.width + pad * 2),
    height: Math.min(Math.round(vp.height * 2.5), box.height + pad * 2)
  };
  await page.screenshot({ path: file, clip });
  return file;
}

async function stitch(headerPath, bodyPath, outPath) {
  const [hMeta, bMeta] = await Promise.all([sharp(headerPath).metadata(), sharp(bodyPath).metadata()]);
  const targetW = Math.max(hMeta.width || 0, bMeta.width || 0);
  const headerBuf = await sharp(headerPath).resize({ width: targetW }).toBuffer();
  const bodyBuf   = await sharp(bodyPath).resize({ width: targetW }).toBuffer();
  const headerH   = (await sharp(headerBuf).metadata()).height || 0;
  const bodyH     = (await sharp(bodyBuf).metadata()).height || 0;

  await sharp({ create: { width: targetW, height: headerH + bodyH, channels: 4, background: BG } })
    .composite([{ input: headerBuf, top: 0, left: 0 }, { input: bodyBuf, top: headerH, left: 0 }])
    .png()
    .toFile(outPath);
}

// Generic stitched capture for a desktop URL
async function captureDesktop({ page, url, bodySelector, outName }) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await hideOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);

  const headerPath = path.join(OUTDIR, `__tmp-header.png`);
  const headerClip = await getHeaderClip(page, 6);
  if (headerClip) {
    await page.screenshot({ path: headerPath, clip: headerClip });
  } else {
    const vp = page.viewport();
    await page.screenshot({ path: headerPath, clip: { x: 0, y: 0, width: vp.width, height: 120 } });
  }

  await removeHeaderDOM(page);
  await deepScroll(page, 2, 220);
  const bodyPath = path.join(OUTDIR, `__tmp-body.png`);
  await shot(page, bodySelector, bodyPath, 12);

  const outPath = path.join(OUTDIR, outName);
  await stitch(headerPath, bodyPath, outPath);
  try { fs.unlinkSync(headerPath); } catch {}
  try { fs.unlinkSync(bodyPath); } catch {}
  console.log("✓", outPath);
}

// --- Blog discovery: pick the latest /blogs/.../posts/... link ---
async function findLatestBlogPostUrl(page) {
  // 1) Try to locate a blog index URL from header/nav; fallback to canonical /blogs/news
  let blogIndex = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/blogs/"]'));
    const navLink = links.find(a => a.closest("nav, header"));
    return (navLink && navLink.href) || (links[0] && links[0].href) || null;
  });
  if (!blogIndex) blogIndex = "https://inli10prints.com/blogs/news";

  // 2) Open index, collect candidate post links and pick the first (usually latest)
  await page.goto(blogIndex, { waitUntil: "networkidle2", timeout: 0 });
  await hideOverlays(page);
  await sleep(250);

  const postUrl = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/blogs/"]'));
    // Filter to post permalinks: /blogs/{blog}/{post}
    const posts = anchors.map(a => a.href).filter(h => /\/blogs\/[^/]+\/[^/]+$/.test(h));
    // Prefer cards near top
    const uniq = [...new Set(posts)];
    return uniq[0] || null;
  });

  return postUrl;
}

// --- Mobile menu open helper on homepage ---
async function openMobileMenu(mobilePage) {
  // try several common selectors
  const selectors = [
    'button[aria-label*="menu" i]',
    'button[aria-controls*="menu"]',
    '.header__icon--menu',
    '.menu-toggle, .nav-toggle, .drawer__button',
    'summary[aria-controls*="menu"]',
  ];
  for (const s of selectors) {
    const btn = await mobilePage.$(s);
    if (btn) {
      await btn.click({ delay: 50 });
      await sleep(400);
      return true;
    }
  }
  // fallback: tap left top region (where burgers often are)
  await mobilePage.touchscreen.tap(24, 80);
  await sleep(400);
  return true;
}

// --- Latest product URL: first item in "New Arrivals" collection ---
async function findLatestProductUrl(page) {
  await page.goto("https://inli10prints.com/collections/new-arrivals", { waitUntil: "networkidle2", timeout: 0 });
  await hideOverlays(page);
  const url = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/products/"]');
    return link ? link.href : null;
  });
  return url;
}

(async () => {
  await ensureDir(OUTDIR);
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 }
  });

  // ---------- DESKTOP (stitched) ----------
  const page = await browser.newPage();

  // 1) Home
  await captureDesktop({
    page,
    url: "https://inli10prints.com/",
    bodySelector: "main",
    outName: "01-home-desktop.png",
  });

  // 2) New Arrivals
  await captureDesktop({
    page,
    url: "https://inli10prints.com/collections/new-arrivals",
    bodySelector: "main .collection, main .product-grid, main",
    outName: "02-new-arrivals-desktop.png",
  });

  // 3) Latest Blog Post
  const latestBlog = await findLatestBlogPostUrl(page);
  if (latestBlog) {
    await captureDesktop({
      page,
      url: latestBlog,
      bodySelector: "main article, main .article, main .rte, main .page-width, main",
      outName: "03-latest-blog-desktop.png",
    });
  } else {
    console.warn("⚠️ Could not discover a blog post; skipping #3.");
  }

  // 6) Latest Product PDP (desktop)
  const latestProductUrl = await findLatestProductUrl(page);
  if (latestProductUrl) {
    await captureDesktop({
      page,
      url: latestProductUrl,
      bodySelector: "main .product, main [class*='product'][class*='section'], main",
      outName: "06-latest-product-desktop.png",
    });
  } else {
    console.warn("⚠️ Could not find a latest product; skipping #6.");
  }

  // ---------- MOBILE ----------
  const mobile = await browser.newPage();
  const iPhone13 = puppeteer.devices?.["iPhone 13 Pro"];
  if (iPhone13) await mobile.emulate(iPhone13);
  else {
    await mobile.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    );
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  }
  await mobile.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

  // 4) Mobile menu UX (Home with menu opened)
  await mobile.goto("https://inli10prints.com/", { waitUntil: "networkidle2", timeout: 0 });
  await hideOverlays(mobile);
  await sleep(300);
  await openMobileMenu(mobile);
  await sleep(300);
  const mobileMenuOut = path.join(OUTDIR, "04-mobile-menu.png");
  await mobile.screenshot({ path: mobileMenuOut, fullPage: false });
  console.log("✓", mobileMenuOut);

  // 5) Home (mobile) hero slice
  await mobile.goto("https://inli10prints.com/", { waitUntil: "networkidle2", timeout: 0 });
  await hideOverlays(mobile);
  await sleep(300);
  const mobileHomeOut = path.join(OUTDIR, "05-home-mobile.png");
  await mobile.screenshot({ path: mobileHomeOut, fullPage: false });
  console.log("✓", mobileHomeOut);

  await browser.close();
  console.log("\n✅ Saved to", OUTDIR);
})();
