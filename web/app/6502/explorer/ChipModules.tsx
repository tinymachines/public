"use client";

import { useEffect, useState } from "react";

/**
 * Load the explorer's modules, resolving their names at runtime.
 *
 * Their build content-hashes every filename and writes `asset-manifest.json`
 * beside them, so `app.js` is really `app.695d867b.js`. Reading that manifest
 * at OUR build time would pin their hashes into this page, and their next
 * deploy would leave us importing files that no longer exist: a blank canvas
 * and a 404, on a page nobody had touched. Reading it in the browser makes the
 * two deploys independent, which is worth one small fetch.
 *
 * ## Why the data needs no help
 *
 * The modules fetch their data DOCUMENT-relative: the built `app.js` says
 * `fetch('layout.334bf277.bin')`, which from this page resolves to
 * `/6502/layout.334bf277.bin`. The apex serves exactly that, aliased to the
 * same directory the 6502 site serves it from. So not one line of their code
 * is patched, and nothing here has to know a hash.
 *
 * The module's own imports are module-relative and resolve under
 * `/6502/chip/`, which is aliased to the same place.
 *
 * ## Failure is reported, not swallowed
 *
 * Unlike the service worker, this IS the page: if it does not load there is
 * nothing to look at, and a blank canvas with a clean console is the failure
 * this repository keeps a list of. It says so in the page's own error slot.
 */
export function ChipModules() {
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/6502/chip/asset-manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`asset-manifest.json: ${res.status}`);
      const manifest = (await res.json()) as Record<string, string>;

      const entry = manifest["app.js"];
      if (!entry) throw new Error("asset-manifest.json names no app.js");
      if (cancelled) return;

      // A variable specifier on purpose: this is a URL served by the origin,
      // not a module in our bundle. TypeScript cannot resolve it and the
      // bundler must not follow it, or it would try to inline somebody else's
      // build output into ours.
      const url = `/6502/chip/${entry}`;
      await import(/* webpackIgnore: true */ url);
    })().catch((e: unknown) => {
      if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!failed) return null;
  return (
    <p className="notice fail" role="alert">
      <b>The chip did not load.</b> {failed}. The explorer&rsquo;s modules and its
      die data are served from <code>/6502/chip/</code>, which is the 6502
      site&rsquo;s own directory: if that has moved, this page needs to be told
      where.
    </p>
  );
}
