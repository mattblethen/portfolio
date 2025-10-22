// capture-rkyhighlandgames.js — RKY Highland Games captures
// Desktop stitched (header+section), Mobile menu UX, Latest blog, Schedule/Events, Sponsors, Vendors, Location
// ESM compatible ("type": "module")
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import sharp from "sharp";

const CANDIDATE_HOSTS = [
  "https://rkyhighlandgames.com",
  "https://www.rkyhighlandgames.com",
  "http://rkyhighlandgames.com",
];
const OUTDIR = path.join(process.cwd(), "public", "images", "portfolio", "rky-highland-games");
const BG = { r: 15, g: 15, b: 16, alpha: 1 };

// ---------- utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
async function deepScroll(page, steps = 8, pause = 220) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.9)));
    await sleep(pause);
  }
}
async function hideOverlays(page) {
  await page.addStyleTag({ content: `
    /* common nuisances / banners / admin bars */
    .modal, .overlay, .lightbox, .mfp-wrap, .mfp-bg,
    .newsletter, .klaviyo-form, .pum, .pum-overlay,
    iframe[src*="chat"], .chat-widget, .tawk-widget,
    [id*="cookie" i], [class*="cookie" i], [aria-label*="cookie" i],
    [id*="consent" i], [class*="consent" i],
    #wpadminbar, .grecaptcha-badge { display:none !important; visibility:hidden !important; }
  `});
}
async function gotoOk(page, url) {
  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => null);
  return resp && resp.ok() ? resp : null;
}
async function probeSite(page) {
  for (const base of CANDIDATE_HOSTS) {
    const r = await gotoOk(page, base + "/");
    if (r) return base;
  }
  // last resort: still return primary; caller can continue
  return CANDIDATE_HOSTS[0];
}

// ---------- header clip / stitch ----------
async function getHeaderClip(page, pad = 0) {
  return await page.evaluate((pad) => {
    const sels = [
      'header.site-header', '.site-header', '.elementor-location-header', '.e-site-header',
      '.ast-desktop-header', '.main-header-bar', '.navbar', '.header', '#header',
      '.announcement', '.announcement-bar', '.announcement-bar__message'
    ];
    let top = Infinity, bottom = -Infinity, found = false;
    for (const s of sels) {
      document.querySelectorAll(s).forEach(el => {
        const r = el.getBoundingClientRect?.();
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
      'header.site-header', '.site-header', '.elementor-location-header', '.e-site-header',
      '.ast-desktop-header', '.main-header-bar', '.navbar', '.header', '#header',
      '.announcement', '.announcement-bar', '.announcement-bar__message'
    ];
    const set = new Set();
    sels.forEach(s => document.querySelectorAll(s).forEach(n => set.add(n)));
    set.forEach(n => n.remove());
  });
}
async function shot(page, selector, file, pad = 10) {
  try { await page.waitForSelector(selector, { visible: true, timeout: 20000 }); } catch {}
  const el = await page.$(selector);
  const vp = page.viewport();
  if (!el) {
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: vp.width, height: Math.min(900, vp.height) } });
    return file;
  }
  await el.scrollIntoViewIfNeeded?.();
  await sleep(150);
  const box = await el.boundingBox();
  const clip = {
    x: Math.max(0, (box?.x ?? 0) - pad),
    y: Math.max(0, (box?.y ?? 0) - pad),
    width: Math.min(vp.width, (box?.width ?? vp.width) + pad * 2),
    height: Math.min(Math.round(vp.height * 2.5), (box?.height ?? vp.height) + pad * 2)
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
async function captureDesktop({ page, url, bodySelector, outName }) {
  const r = await gotoOk(page, url);
  if (!r) { console.warn("⚠️ Skipping (bad response):", url); return; }
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await hideOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);

  const headerPath = path.join(OUTDIR, `__tmp-header.png`);
  const headerClip = await getHeaderClip(page, 6);
  if (headerClip) await page.screenshot({ path: headerPath, clip: headerClip });
  else {
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

// ---------- discovery ----------
async function findNavLink(page, patterns = [], fallbacks = [], baseURL = "") {
  const url = await page.evaluate((patterns) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const headerAnchors = anchors.filter(a => a.closest('header, nav, .site-header, .elementor-location-header, .main-header-bar'));
    const test = (s) => patterns.some(p => new RegExp(p, 'i').test(s || ""));
    const pick = (list) => {
      for (const a of list) {
        const h = a.href || "";
        const t = (a.textContent || "").trim();
        if (test(h) || test(t)) return h;
      }
      return null;
    };
    return pick(headerAnchors) || pick(anchors) || null;
  }, patterns);

  if (url) return url;
  for (const fb of fallbacks) {
    try { return new URL(fb, baseURL).href; } catch {}
  }
  return null;
}

async function findFromSitemap(page, baseURL, want = /(schedule|events|sponsor|vendor|location|compet|blog|news)/i) {
  const ok = await gotoOk(page, baseURL + "/sitemap.xml");
  if (!ok) return null;
  const match = await page.evaluate((re) => {
    const links = Array.from(document.querySelectorAll("loc")).map(n => n.textContent?.trim() || "");
    return links.find(h => re.test(h)) || null;
  }, want);
  return match || null;
}

async function findLatestBlogPostUrl(page, baseURL) {
  // Try feed first
  let resp = await gotoOk(page, baseURL + "/feed");
  if (resp) {
    const firstItem = await page.evaluate(() => {
      const item = document.querySelector("item > link, entry > link");
      if (item) {
        // RSS: <link>https://.../post</link> ; Atom: <link href="..."/>
        if (item.tagName.toLowerCase() === "link" && item.getAttribute("href")) return item.getAttribute("href");
        return item.textContent?.trim() || null;
      }
      return null;
    });
    if (firstItem) return firstItem;
  }
  // Fallback: blog/news index then pick first post-looking URL
  await gotoOk(page, baseURL + "/");
  await hideOverlays(page);
  let blogIndex =
    await findNavLink(page, ['blog', 'news', '/category/', '/archives'], ['/blog', '/news', '/category/news', '/archives'], baseURL)
    || baseURL + "/blog";
  await gotoOk(page, blogIndex);
  await hideOverlays(page);
  await sleep(250);
  const post = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const candidates = anchors.map(a => a.href).filter(h => {
      try {
        const u = new URL(h);
        return (
          /\/20\d{2}\/\d{2}\/[^/]+\/?$/.test(u.pathname) ||
          /\/blog\/[^/]+\/?$/.test(u.pathname) ||
          /\/news\/[^/]+\/?$/.test(u.pathname) ||
          /\/\?p=\d+/.test(u.search)
        );
      } catch { return false; }
    });
    return [...new Set(candidates)][0] || null;
  });
  return post;
}

async function findScheduleOrEventsUrl(page, baseURL) {
  await gotoOk(page, baseURL + "/");
  await hideOverlays(page);
  const patterns = ['schedule', 'events', 'competitions', 'itinerary', 'program'];
  const fallbacks = ['/schedule', '/events'];
  const nav = await findNavLink(page, patterns, fallbacks, baseURL);
  if (nav) return nav;
  return await findFromSitemap(page, baseURL, /(schedule|event|program|itinerary)/i);
}

async function findSponsorsUrl(page, baseURL) {
  await gotoOk(page, baseURL + "/");
  await hideOverlays(page);
  const nav = await findNavLink(page, ['sponsor', 'sponsorship', 'partners'], ['/sponsors', '/sponsorship'], baseURL);
  if (nav) return nav;
  return await findFromSitemap(page, baseURL, /(sponsor|partner)/i);
}

async function findVendorsUrl(page, baseURL) {
  await gotoOk(page, baseURL + "/");
  await hideOverlays(page);
  const nav = await findNavLink(page, ['vendor', 'vendors', 'food', 'merchants'], ['/vendors', '/vendor'], baseURL);
  if (nav) return nav;
  return await findFromSitemap(page, baseURL, /(vendor|food|merchant)/i);
}

async function findLocationUrl(page, baseURL) {
  await gotoOk(page, baseURL + "/");
  await hideOverlays(page);
  const nav = await findNavLink(page, ['location', 'map', 'parking', 'visit', 'directions'], ['/location', '/visit', '/map'], baseURL);
  if (nav) return nav;
  return await findFromSitemap(page, baseURL, /(location|map|parking|directions|visit)/i);
}

// ---------- mobile menu ----------
async function openMobileMenu(mobilePage) {
  const selectors = [
    'button.menu-toggle', '.menu-toggle', '.ast-mobile-menu-buttons .menu-toggle',
    '.elementor-menu-toggle', 'button[aria-controls*="menu"]', 'button[aria-label*="menu" i]',
    '.hamburger', '.hamburger-box', '.mobile-menu-toggle', '#menu-toggle',
    'summary[aria-controls*="menu"]',
    '.drawer-toggle', '.nav-toggle'
  ];
  for (const s of selectors) {
    const btn = await mobilePage.$(s);
    if (btn) { await btn.click({ delay: 60 }); await sleep(550); return true; }
  }
  try { await mobilePage.touchscreen.tap(24, 80); await sleep(500); } catch {}
  return true;
}

// ---------- main ----------
(async () => {
  await ensureDir(OUTDIR);
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 }
  });

  // Resolve the base that actually responds 200 for you
  const probe = await browser.newPage();
  const BASE = await probeSite(probe);
  console.log("Base URL:", BASE);

  // DESKTOP
  const page = probe;

  // 1) Home
  await captureDesktop({
    page,
    url: BASE + "/",
    bodySelector: "main, #main, .site-content, .elementor-location-content",
    outName: "01-home-desktop.png",
  });

  // 2) Schedule/Events
  const scheduleUrl = await findScheduleOrEventsUrl(page, BASE);
  if (scheduleUrl) {
    await captureDesktop({
      page, url: scheduleUrl,
      bodySelector: "main article, .entry-content, main, #main, .site-content, .elementor-location-content",
      outName: "02-schedule-desktop.png",
    });
  } else console.warn("⚠️ Could not find a Schedule/Events page; skipping #2.");

  // 3) Latest Blog
  const latestBlog = await findLatestBlogPostUrl(page, BASE);
  if (latestBlog) {
    await captureDesktop({
      page, url: latestBlog,
      bodySelector: "main article, .entry-content, main, #main, .site-content",
      outName: "03-latest-blog-desktop.png",
    });
  } else console.warn("⚠️ Could not discover a blog post; skipping #3.");

  // 4) Sponsors
  const sponsorsUrl = await findSponsorsUrl(page, BASE);
  if (sponsorsUrl) {
    await captureDesktop({
      page, url: sponsorsUrl,
      bodySelector: "main article, .entry-content, main, #main, .site-content, .elementor-location-content",
      outName: "04-sponsors-desktop.png",
    });
  } else console.warn("⚠️ Could not find a Sponsors page; skipping #4.");

  // 5) Vendors
  const vendorsUrl = await findVendorsUrl(page, BASE);
  if (vendorsUrl) {
    await captureDesktop({
      page, url: vendorsUrl,
      bodySelector: "main article, .entry-content, main, #main, .site-content, .elementor-location-content",
      outName: "05-vendors-desktop.png",
    });
  } else console.warn("⚠️ Could not find a Vendors page; skipping #5.");

  // 6) Location / Map
  const locationUrl = await findLocationUrl(page, BASE);
  if (locationUrl) {
    await captureDesktop({
      page, url: locationUrl,
      bodySelector: "main article, .entry-content, main, #main, .site-content, .elementor-location-content",
      outName: "06-location-desktop.png",
    });
  } else console.warn("⚠️ Could not find a Location page; skipping #6.");

  // MOBILE
  const mobile = await browser.newPage();
  const iPhone13 = puppeteer.devices?.["iPhone 13 Pro"];
  if (iPhone13) await mobile.emulate(iPhone13);
  else {
    await mobile.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1");
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  }
  await mobile.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

  // 7) Mobile Menu UX (Home with menu opened)
  await gotoOk(mobile, BASE + "/");
  await hideOverlays(mobile);
  await sleep(400);
  await openMobileMenu(mobile);
  await sleep(400);
  const mobileMenuOut = path.join(OUTDIR, "07-mobile-menu.png");
  await mobile.screenshot({ path: mobileMenuOut, fullPage: false });
  console.log("✓", mobileMenuOut);

  // 8) Home (mobile) hero slice
  await gotoOk(mobile, BASE + "/");
  await hideOverlays(mobile);
  await sleep(300);
  const mobileHomeOut = path.join(OUTDIR, "08-home-mobile.png");
  await mobile.screenshot({ path: mobileHomeOut, fullPage: false });
  console.log("✓", mobileHomeOut);

  await browser.close();
  console.log("\n✅ Saved to", OUTDIR);
})();

