/**
 * Write the Halfwave Lab's stylesheet and script to public/ as files.
 *
 * They were inlined into the page, which is what lib/lab.ts produces, and that
 * cost more than it looked like. A server component's props are serialised
 * into the RSC payload as well as rendered into the HTML, so 35 KB of CSS and
 * 126 KB of script were being SENT TWICE. Measured: /6502/lab was 330 KB raw
 * against the 207 KB the same page costs on its own subdomain, and 126 KB of
 * that was a script re-downloaded on every visit rather than cached.
 *
 * As files they are fetched once and cached by the origin's own rules, and
 * neither appears in the payload at all.
 *
 * Generated rather than committed for the reason sw.js is: they are derived
 * from projects/6502/lab/halfwave-lab.html by lib/lab.ts, which scopes the CSS
 * and patches three things in the script. A committed copy is a second copy
 * that nothing re-derives.
 *
 * The same lab() the page calls, so there is one implementation of the
 * transform and not two that can disagree about what the lab is.
 */

import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { lab } from "../lib/lab.ts";

const OUT = path.join(import.meta.dirname, "..", "public", "6502", "lab");
const { style, script, assets } = lab();

// Wiped rather than added to. The names carry a content hash, so every change
// to the lab or to the transform leaves the previous pair behind, and a
// directory that only grows would publish every version this checkout has ever
// built. Safe to remove outright: nothing here is source, it is all derived
// from projects/6502/lab/ and gitignored.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, path.basename(assets.css)), style);
await writeFile(path.join(OUT, path.basename(assets.js)), script);

console.log(
  `build-lab: ${path.basename(assets.css)} (${(style.length / 1024).toFixed(0)} KB) ` +
    `and ${path.basename(assets.js)} (${(script.length / 1024).toFixed(0)} KB)`,
);
