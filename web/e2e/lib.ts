import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const BASE = process.env.BASE ?? "https://tinymachines.ai";
export const UPSTREAM = process.env.UPSTREAM ?? "https://6502.tinymachines.ai";
export const OUT = path.join(__dirname, "out");
export const PHONE = { width: 390, height: 844 };
export const NARROW = { width: 360, height: 780 };
export const DESK = { width: 1280, height: 900 };

/** Every path in the sitemap, written by global-setup. */
export function pages(): string[] {
  const list = JSON.parse(fs.readFileSync(path.join(OUT, "pages.json"), "utf8")) as string[];
  if (list.length < 100) throw new Error(`pages.json has ${list.length} pages; the sitemap is not what it was`);
  return list;
}
export const isJa = (p: string) => p === "/ja" || p.startsWith("/ja/");
export const en = () => pages().filter((p) => !isJa(p));

/** The explorer sub-pages: everything under /6502/ that is a ported page. */
export const TOOL_PAGES = [
  "/6502/explorer", "/6502/primer", "/6502/tracer", "/6502/blueprint", "/6502/chipmap", "/6502/decode",
  "/6502/designer", "/6502/diegraph", "/6502/exploded", "/6502/halfshot", "/6502/pinout", "/6502/programs",
  "/6502/schematic", "/6502/talk", "/6502/timing", "/6502/trace", "/6502/block", "/6502/blockdiagram",
];
/** Pages that register a chip driver, so the strip is live (measured 2026-08-25). */
export const STRIP_LIVE = [
  "/6502/explorer", "/6502/primer", "/6502/tracer", "/6502/games", "/6502/blueprint",
  "/6502/chipmap", "/6502/exploded", "/6502/schematic", "/6502/programs",
  "/6502/trace", "/6502/halfshot", "/6502/lab",
];
/** Strip pages whose driver has no power switch: a recording is not booted. */
export const NO_SWITCH = ["/6502/trace", "/6502/halfshot"];
/** Strip pages whose driver has no opcode step (a recording carries no SYNC to stop on). */
export const NO_OP = ["/6502/trace", "/6502/halfshot"];

/** A page with its scripts settled. The chip pages boot wasm; the number is what they need. */
export async function open(page: Page, p: string, settle = 2500) {
  const r = await page.goto(p, { waitUntil: "load", timeout: 45_000 });
  if (!r || r.status() !== 200) throw new Error(`${p}: HTTP ${r?.status()}`);
  await page.waitForTimeout(settle);
}

/** Sideways overflow, and the elements outside any scroll container that cause it. */
export async function overflow(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const px = d.scrollWidth - d.clientWidth;
    const out: string[] = [];
    if (px > 0) {
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right <= d.clientWidth + 1 || r.width === 0) continue;
        let inScroller = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) { inScroller = true; break; }
        }
        if (!inScroller) out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} right=${Math.round(r.right)}`);
      }
    }
    return { px, out: out.slice(0, 8) };
  });
}

/** Visible text of the document, for the prose scans. Code and scripts excluded. */
export async function visibleText(page: Page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let s = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("script, style, code, pre, kbd, noscript, template")) continue;
      s += n.textContent + "\n";
    }
    return s;
  });
}
