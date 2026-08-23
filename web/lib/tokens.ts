import fs from "node:fs";
import path from "node:path";

/**
 * One token's value, read out of ../style/tokens.css at build time.
 *
 * The manifest needs a theme colour and a background colour, and typing either
 * of them is the drift nobody notices: an install banner or a splash screen
 * one revision behind the palette looks exactly like an install banner. Same
 * reasoning as style/build-icon.py, which reads the same file for the same
 * reason, and the same rule the whole repository runs on.
 *
 * This is a second reader of tokens.css rather than a second copy of the
 * palette, which is the distinction that matters: there is still exactly one
 * place a colour is written down.
 *
 * Build time only. Every route here is prerendered, so this runs on the
 * machine doing the build and no CSS parsing reaches a browser.
 */

const TOKENS = path.join(process.cwd(), "..", "style", "tokens.css");

export function token(name: string): string {
  const css = fs.readFileSync(TOKENS, "utf8");
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{3,8})`));
  if (!m) {
    // A build failure rather than a fallback colour. A manifest that silently
    // falls back to something plausible is one nobody ever discovers is wrong.
    throw new Error(
      `style/tokens.css has no --${name}. Something that needs it cannot be ` +
        "drawn from a palette that does not have it.",
    );
  }
  return m[1];
}
