/**
 * The one line the brief carries where the token goes. In its own module,
 * with no imports, because it is read on both sides: lib/brief.ts writes it
 * on the server, and Brief.tsx swaps it for the real token in the browser,
 * where the token is and the server never is.
 */
export const TOKEN_PLACEHOLDER =
  "- Your token: not in this document. The editor's download puts it here; until then, paste it where the agent asks.";

export const SKILL_NAME = "tm6502-cart";

export function withToken(text: string, token: string): string {
  const line = `- Your token: \`${token}\`. Send it as \`Authorization: Bearer ${token}\`. It is a secret: whoever holds it publishes to this page.`;
  return text.includes(TOKEN_PLACEHOLDER) ? text.replace(TOKEN_PLACEHOLDER, line) : text + `\n\n## Your token\n\n${line}\n`;
}
