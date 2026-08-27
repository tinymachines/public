import { chromium } from "@playwright/test";
const out = "/tmp/claude-1000/-home-bisenbek-projects-tinymachines-public/df49fc18-048e-47c2-bff3-d6689888b0f0/scratchpad/lab";
const b = await chromium.launch();
for (const path of ["/6502/tracer/article", "/docs", "/docs/6502/verification"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const r = await p.goto("https://tinymachines.ai" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  console.log(path, r.status(), JSON.stringify(await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), h: Math.round(b.height), pos: getComputedStyle(e).position }; };
    return { doc: document.documentElement.scrollHeight, appfoot: r(".app-foot"), sitefoot: r(".site-foot"), strip: r(".chip-transport"), nav: r(".docs-nav"), navLinks: document.querySelectorAll(".docs-nav a").length, main: r(".docs-main, .docs-body, main") };
  })));
  await p.screenshot({ path: `${out}/${path.replace(/\W+/g, "_")}.png`, fullPage: true });
  await p.close();
}
await b.close();
