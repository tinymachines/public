import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { lab, LAB_SRC, replaceDashes } from "./lab";

/**
 * The Lab is read from the 6502 checkout, not copied. These hold what the
 * read produces: no em dash survives (house style), the chip API is named,
 * and the Lab registers with the site's chip store, which is what lets the
 * floor strip drive it. A Lab that stops doing that would ship with its own
 * player hidden and no keys at all.
 */

describe("the Lab, read from the 6502 tree", () => {
  const L = lab();

  test("it is the checkout's file", () => {
    expect(fs.existsSync(path.join(LAB_SRC, "halfwave-lab.html"))).toBe(true);
  });

  test("no em dash ships", () => {
    for (const [name, text] of [["style", L.style], ["body", L.body], ["script", L.script]] as const) {
      expect(text.includes("\u2014"), `${name} carries an em dash`).toBe(false);
      expect(text.includes("&mdash;"), `${name} carries &mdash;`).toBe(false);
    }
  });

  test("the chip API is named, not assumed", () => {
    expect(L.script.includes('location.origin + "/api"')).toBe(false);
    expect(L.script.includes("https://6502.tinymachines.ai/api")).toBe(true);
  });

  test("the Lab registers with the site's chip store", () => {
    expect(L.script.includes("tm:chip-store"), "the handover event").toBe(true);
    expect(L.script.includes("registerDriver("), "a driver").toBe(true);
    expect(L.script.includes('classList.add("driven")'), "the player marks itself driven").toBe(true);
  });

  test("every token the Lab's rules name is defined on the shell", () => {
    // A var() naming a token that does not exist drops its declaration
    // silently, so a name missing from lab.css is a rule that quietly does
    // nothing: the tab strip lost its face this way (2026-08-27). The kit's
    // own names are the kit's to define; everything else the lab's rules
    // name must be on .lab-shell itself, where a rule outside a panel can
    // see it, not only inside .panel.
    const sheet = fs.readFileSync(path.join(process.cwd(), "app", "[lang]", "6502", "lab", "lab.css"), "utf8");
    const shell = sheet.match(/^\.lab-shell \{\n([\s\S]*?)^\}/m);
    expect(shell, "the .lab-shell token block").not.toBeNull();
    const defined = new Set([...shell![1].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    const root = sheet.match(/^:root \{\n([\s\S]*?)^\}/m);
    for (const m of root?.[1].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm) ?? []) defined.add(m[1]);
    const named = new Set([...L.style.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    expect(named.size).toBeGreaterThan(20);
    const kit = (n: string) => /^--(color|font|radius|text|u$|app-)/.test(n);
    const missing = [...named].filter((n) => !kit(n) && !defined.has(n)).sort();
    expect(missing, "named by the lab's rules, defined nowhere on paper").toEqual([]);
  });

  test("the assets carry a content hash", () => {
    expect(L.assets.css).toMatch(/lab\.[0-9a-f]{10}\.css$/);
    expect(L.assets.js).toMatch(/lab\.[0-9a-f]{10}\.js$/);
  });
});

describe("the em-dash pass", () => {
  test("a comma before a conjunction, a colon otherwise, and only the spaced form", () => {
    const r = replaceDashes("bit by bit \u2014 and the carry; together &mdash; one value; a\u2014b; x \u2014which");
    expect(r.text).toBe("bit by bit, and the carry; together: one value; a\u2014b; x \u2014which");
    expect(r.count).toBe(2);
  });
});
