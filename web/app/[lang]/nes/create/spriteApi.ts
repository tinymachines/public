/**
 * The sprite generator from the page: tinymachines.ai/sprites, for
 * signed-in users (nginx asks the API's /v1/me first). Its tools are MCP
 * over streamable HTTP at /sprites/mcp/: an initialize that opens a
 * session, then tools/call with the session's id; answers come as one
 * server-sent event. Images come from /sprites/view, a sprite's own file
 * only.
 */

export interface GeneratedSprite {
  filename: string;
  url?: string;
}

let session: string | null = null;
let rpc = 0;

async function post(body: object): Promise<{ result?: unknown; error?: { message: string } } | null> {
  const r = await fetch("/sprites/mcp/", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  if (r.type === "opaqueredirect" || r.status === 401 || r.status === 302) throw new Error("signed-out");
  if (!r.ok && r.status !== 202) throw new Error(`the generator answered ${r.status}`);
  const id = r.headers.get("mcp-session-id");
  if (id) session = id;
  const text = await r.text();
  const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  return data ? JSON.parse(data) : text ? JSON.parse(text) : null;
}

async function open() {
  if (session) return;
  await post({ jsonrpc: "2.0", id: ++rpc, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "tinymachines-desk", version: "1" } } });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
}

/** A tool's answer: its first text block, parsed as JSON. */
async function tool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await open();
  let a = await post({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } });
  // A session the server no longer knows: open a fresh one and ask again.
  if (a?.error && /session/i.test(a.error.message)) {
    session = null;
    await open();
    a = await post({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } });
  }
  if (a?.error) throw new Error(a.error.message);
  const content = (a?.result as { content?: { type: string; text: string }[]; isError?: boolean })?.content ?? [];
  const text = content.find((c) => c.type === "text")?.text ?? "null";
  if ((a?.result as { isError?: boolean })?.isError) throw new Error(text);
  return JSON.parse(text) as T;
}

/** Whether this browser is signed in (the generator admits only those who are). */
export async function signedIn(): Promise<boolean> {
  const r = await fetch("/api/v1/me", { credentials: "same-origin" });
  return r.ok;
}

export function listSprites(limit = 24): Promise<GeneratedSprite[]> {
  return tool<GeneratedSprite[]>("list_sprites", { limit });
}

/** A new sprite from a prompt: tens of seconds, minutes the first time after a restart. */
export function generateSprite(prompt: string): Promise<GeneratedSprite> {
  return tool<GeneratedSprite>("generate_sprite", { prompt, style: "pixel_art" });
}

/** A generated sprite's picture, as a URL on this site. */
export function spriteUrl(filename: string): string {
  return `/sprites/view?filename=${encodeURIComponent(filename)}&type=output`;
}
