import { test, expect } from "@playwright/test";
import { open, overflow, PHONE } from "./lib";

/**
 * The editor with everything a signed-in builder sees: every [hidden]
 * section revealed and an account card with a tokens table and a minted
 * token, injected as Account.tsx renders them. Found 2026-08-25: the signed
 * out sweep passed while the signed-in page was 501px wide on a 390px phone.
 */
test.describe("manage, signed in", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const p of ["/6502/manage", "/ja/6502/manage"]) {
    test(`${p} holds with the account card open`, async ({ page }) => {
      await open(page, p, 2000);
      const revealed = await page.evaluate(() => {
        const hidden = document.querySelectorAll("[hidden]");
        for (const el of hidden) el.removeAttribute("hidden");
        const shell = document.querySelector(".manage-shell")!;
        const card = document.createElement("section");
        card.className = "card"; card.id = "account";
        card.innerHTML = `<p class="note acct-who">Signed in as Some Person (@someperson on GitHub). <button class="linkish">sign out</button></p>
          <table class="acct-tokens"><tbody><tr><td><code>tm6502_abcd1234…</code></td><td><a href="#">@someperson</a></td><td>live</td><td><button class="filebtn">re-issue</button> <button class="filebtn">revoke</button></td></tr></tbody></table>
          <pre class="mint-token"><code>tm6502_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d</code></pre>
          <p class="note">Publish: PUT https://6502.tinymachines.ai/api/v1/registry/b/someperson/roms/someperson</p>`;
        shell.prepend(card);
        return hidden.length;
      });
      expect(revealed, "there were hidden sections to reveal").toBeGreaterThan(2);
      const o = await overflow(page);
      expect(o.out, `${o.px}px sideways`).toEqual([]);
      expect(o.px).toBe(0);
    });
  }
});
