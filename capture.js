// capture.js — one-off screenshot for ANY given URL (desktop/mobile/menu)
// ESM compatible: set "type":"module" in package.json
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import puppeteer from "puppeteer";

const OUTDIR = path.join(process.cwd(), "public", "images", "captures");

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function statusOK(resp) { const s = resp?.status?.(); return typeof s === "number" && s >= 200 && s < 400; }
function slugify(str) { return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function ts() { const d = new Date(); const p = n => String(n).padStart(2,"0"); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }

async function preparePage(page, { mobile = false } = {}) {
  const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const mobileUA  = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";

  await page.setUserAgent(mobile ? mobileUA : desktopUA);
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9", "Upgrade-Insecure-Requests": "1" });

  // Run BEFORE any site scripts to defeat lazy/hydration gating
  await page.evaluateOnNewDocument(() => {
    // Mask automation
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1,2,3] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US","en"] });

    // Force everything to be "intersecting" so IO-based lazy loaders mount immediately
    const NativeIO = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(cb) { this._cb = cb; }
      observe(el)   { try { this._cb?.([{ isIntersecting: true, intersectionRatio: 1, target: el }]); } catch {} }
      unobserve()   {}
      disconnect()  {}
      takeRecords() { return []; }
    };
    window.IntersectionObserverEntry = NativeIO?.Entry || window.IntersectionObserverEntry || function(){};

    // Don't defer on idle forever
    window.requestIdleCallback = (fn) => setTimeout(() => fn({ timeRemaining: () => 50, didTimeout: false }), 0);

    // Prefer reduced motion to skip long intro animations
    try {
      const style = document.createElement("style");
      style.textContent = "@media (prefers-reduced-motion: reduce){ *{animation-duration:0.001s !important; animation-iteration-count:1 !important; transition-duration:0.001s !important;}}";
      document.documentElement.appendChild(style);
    } catch {}
  });

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
}

async function gotoSmart(page, url) {
  let resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => null);
  if (!statusOK(resp)) resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  return statusOK(resp) ? resp : null;
}

async function hideOverlays(page) {
  await page.addStyleTag({
    content: `
      .modal, .overlay, .lightbox, .mfp-wrap, .mfp-bg,
      .newsletter, .klaviyo-form, .pum, .pum-overlay,
      iframe[src*="chat"], [id*="chat" i], [class*="chat" i],
      [id*="cookie" i], [class*="cookie" i], [aria-label*="cookie" i],
      [id*="consent" i], [class*="consent" i],
      .grecaptcha-badge, .popup, .pop-up,
      .shopify-section--popup { display:none !important; visibility:hidden !important; }
      img, picture, source { transition: none !important; animation: none !important; }
    `
  });
}

// Lazy-load busters
async function forceEagerImages(page) {
  await page.evaluate(() => {
    const setIf = (el, from, to) => {
      const val = el.getAttribute(from) || (from.startsWith("data-") ? el.dataset[from.slice(5)] : null);
      if (val) el.setAttribute(to, val);
    };
    document.querySelectorAll("img").forEach(img => {
      setIf(img, "data-src", "src");
      setIf(img, "data-srcset", "srcset");
      setIf(img, "data-sizes", "sizes");
      if (!img.getAttribute("src") && img.currentSrc) img.src = img.currentSrc;
      img.removeAttribute("loading");
      img.loading = "eager";
      img.classList.remove("lazyload","lazy-loaded","lazyloaded","lazy");
    });
    document.querySelectorAll("picture source").forEach(s => {
      const d = s.getAttribute("data-srcset");
      if (d) s.setAttribute("srcset", d);
    });
    const bgAttrs = ["data-bg","data-background-image","data-bgset","data-bgsrc"];
    document.querySelectorAll("[data-bg], [data-background-image], [data-bgset], [data-bgsrc]").forEach(el => {
      for (const a of bgAttrs) {
        const v = el.getAttribute(a);
        if (v) {
          if (a === "data-bgset") {
            const first = (v.split(",")[0] || "").trim().split(" ")[0];
            if (first) el.style.backgroundImage = `url("${first}")`;
          } else {
            el.style.backgroundImage = `url("${v}")`;
          }
          el.classList.remove("lazyload","lazy-loaded","lazyloaded","lazy");
          break;
        }
      }
    });
    try { window.dispatchEvent(new Event("scroll")); } catch {}
    try { window.dispatchEvent(new Event("resize")); } catch {}
  });
}

// Scroll ALL scrollable containers (not just window)
async function autoScrollAll(page, {
  stepPx = 800,
  pauseMs = 160,
  maxPasses = 8
} = {}) {
  await page.evaluate(async (stepPx, pauseMs, maxPasses) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const scrollables = (() => {
      const out = new Set([document.scrollingElement || document.documentElement, document.body]);
      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const style = getComputedStyle(el);
        const canScroll = /(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX);
        if (canScroll && el.scrollHeight > el.clientHeight + 4) out.add(el);
      }
      return Array.from(out).filter(Boolean);
    })();

    for (let pass = 0; pass < maxPasses; pass++) {
      let grew = false;

      for (const el of scrollables) {
        el.scrollTo(0, 0);
        await sleep(pauseMs);

        let lastMax = el.scrollHeight;
        for (let y = 0; y < el.scrollHeight + stepPx * 2; y += stepPx) {
          el.scrollTo(0, y);
          window.dispatchEvent(new Event("scroll"));
          window.dispatchEvent(new Event("resize"));
          await sleep(pauseMs);

          if (el.scrollHeight > lastMax + 10) {
            lastMax = el.scrollHeight;
            grew = true;
          }
        }

        el.scrollTo(0, 0);
      }

      if (!grew) break;
    }
  }, stepPx, pauseMs, maxPasses);
}

async function waitForImagesToSettle(page, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(() => {
      const imgs = Array.from(document.images || []);
      const imgsReady = imgs.every(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
      const bgEls = Array.from(document.querySelectorAll("[style*='background-image']"));
      const bgReady = bgEls.every(el => {
        const bi = getComputedStyle(el).backgroundImage;
        return bi && bi.includes("url(");
      });
      return imgsReady && bgReady;
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function unclampRootForFullpage(page) {
  await page.evaluate(() => {
    const fix = (el) => {
      if (!el) return;
      el.style.setProperty("height", "auto", "important");
      el.style.setProperty("min-height", "auto", "important");
      el.style.setProperty("overflow", "visible", "important");
    };
    fix(document.documentElement);
    fix(document.body);
  });
}

async function prepAndSettle(page) {
  await hideOverlays(page);
  await sleep(250);

  // First wave: convert lazy attrs -> eager
  await forceEagerImages(page);

  // Thorough multi-container scroll (fires IO-based lazy loaders)
  await autoScrollAll(page, { stepPx: 900, pauseMs: 180, maxPasses: 10 });

  // Second wave: for nodes inserted during scroll
  await forceEagerImages(page);

  // Let images/backgrounds fully resolve
  await waitForImagesToSettle(page, 18000);
}

async function openMobileMenu(page) {
  const selectors = [
    'button[aria-controls="menu-drawer"]',
    'button[aria-haspopup="dialog"][aria-expanded="false"]',
    '.header__icon--menu',
    '.header__inline-menu button',
    'button.menu-toggle', '.menu-toggle',
    '.mobile-nav-trigger', '.site-header__icon--menu',
    'button[aria-label*="menu" i]'
  ];
  for (const s of selectors) {
    const btn = await page.$(s);
    if (btn) { try { await btn.click({ delay: 60 }); await sleep(600); return true; } catch {} }
  }
  try { await page.touchscreen.tap(24, 64); await sleep(600); } catch {}
  return true;
}

// ---------- main ----------
async function run() {
  await ensureDir(OUTDIR);

  // CLI flags and URL
  const FLAGS = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
  let url = process.argv.slice(2).find(a => !a.startsWith("--"));

  // Interactive if no URL provided
  if (!url) {
    const rl = readline.createInterface({ input, output });
    url = (await rl.question("Paste URL to capture: ")).trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!FLAGS.size) {
      const mode = (await rl.question("Mode [desktop | mobile | menu | mobile+menu] (default desktop): ")).trim().toLowerCase();
      if (mode.includes("mobile") && mode.includes("menu")) FLAGS.add("--mobile+menu");
      else if (mode === "mobile") FLAGS.add("--mobile");
      else if (mode === "menu") FLAGS.add("--menu");
      else FLAGS.add("--desktop");
    }
    await rl.close();
  } else {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!FLAGS.size) FLAGS.add("--desktop"); // default if only URL is passed
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  const u = new URL(url);
  const baseSlug = `${slugify(u.hostname)}${slugify(u.pathname) ? "-" + slugify(u.pathname) : ""}-${ts()}`;

  // --- Desktop (full page of the EXACT URL) ---
  if (FLAGS.has("--desktop")) {
    const page = await browser.newPage();
    await preparePage(page, { mobile: false });
    const ok = await gotoSmart(page, url);
    if (!ok) {
      console.error("⚠️ Could not load (desktop):", url);
    } else {
      await prepAndSettle(page);
      await unclampRootForFullpage(page);
      const outPath = path.join(OUTDIR, `${baseSlug}-desktop.png`);
      await page.screenshot({ path: outPath, fullPage: true, captureBeyondViewport: true });
      console.log("✓ Saved:", outPath);
    }
    await page.close();
  }

  // --- Mobile (viewport of the EXACT URL) ---
  if (FLAGS.has("--mobile") || FLAGS.has("--mobile+menu")) {
    const mobile = await browser.newPage();
    await preparePage(mobile, { mobile: true });
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    const ok = await gotoSmart(mobile, url);
    if (!ok) {
      console.error("⚠️ Could not load (mobile):", url);
    } else {
      await prepAndSettle(mobile);
      const outPath = path.join(OUTDIR, `${baseSlug}-mobile.png`);
      await mobile.screenshot({ path: outPath, fullPage: false, captureBeyondViewport: true });
      console.log("✓ Saved:", outPath);

      // --- Mobile + Menu (on the SAME URL) ---
      if (FLAGS.has("--mobile+menu")) {
        await openMobileMenu(mobile);
        await sleep(400);
        const outPath2 = path.join(OUTDIR, `${baseSlug}-mobile-menu.png`);
        await mobile.screenshot({ path: outPath2, fullPage: false, captureBeyondViewport: true });
        console.log("✓ Saved:", outPath2);
      }
    }
    await mobile.close();
  }

  // --- Menu only (on the EXACT URL) ---
  if (FLAGS.has("--menu") && !FLAGS.has("--mobile") && !FLAGS.has("--mobile+menu")) {
    const mobile = await browser.newPage();
    await preparePage(mobile, { mobile: true });
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    const ok = await gotoSmart(mobile, url);
    if (!ok) {
      console.error("⚠️ Could not load (mobile menu):", url);
    } else {
      await hideOverlays(mobile); // keep menu overlay visible
      await sleep(350);
      await openMobileMenu(mobile);
      await sleep(400);
      const outPath = path.join(OUTDIR, `${baseSlug}-mobile-menu.png`);
      await mobile.screenshot({ path: outPath, fullPage: false, captureBeyondViewport: true });
      console.log("✓ Saved:", outPath);
    }
    await mobile.close();
  }

  await browser.close();
  console.log("\n✅ Done.");
}

run().catch(err => { console.error(err); process.exit(1); });
