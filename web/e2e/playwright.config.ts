import { defineConfig } from "@playwright/test";

/**
 * Unreasonable perfection, automated.
 *
 * Every rule this site was checked against by hand on 2026-08-25 is a spec in
 * this directory, run against a live origin: production by default, a preview
 * with BASE=http://127.0.0.1:6512. The page list is the site's own sitemap,
 * fetched in global-setup, so a new page is tested the day it is published
 * and a hand list cannot drift. Every spec asserts on a count before it
 * asserts on the pages, because a check that can pass on nothing is not a
 * check (CLAUDE.md).
 *
 * Browser: the system Chrome, so a fresh clone needs no browser download.
 * CHROME=/path/to/chrome overrides.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./global-setup.ts",
  outputDir: "./out/results",
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  // One retry, for the network (a run died on ERR_NETWORK_CHANGED). A test
  // that passes only on retry is reported as flaky, not as passed.
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "./out/report", open: "never" }]],
  use: {
    launchOptions: { executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" },
    baseURL: process.env.BASE ?? "https://tinymachines.ai",
    ignoreHTTPSErrors: false,
    screenshot: "only-on-failure",
  },
});
