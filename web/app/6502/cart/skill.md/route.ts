import { briefText, serve } from "@/lib/brief";

/**
 * The brief as a skill: the same text with a name and a description on top,
 * which is the whole of what a skill file is. Save it as
 * `~/.claude/skills/tm6502-cart/SKILL.md` (Claude Code), or as `AGENTS.md`
 * beside the cart (Codex), or paste it as a rule; the body is plain markdown
 * and every platform reads that.
 */
export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams;
  return serve(briefText({ slug: q.get("slug"), handle: q.get("handle"), skill: true }));
}
