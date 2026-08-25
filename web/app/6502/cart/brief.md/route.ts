import { briefText, serve } from "@/lib/brief";

/** The brief as a document. lib/brief.ts says what it is and what is not in it. */
export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams;
  return serve(briefText({ slug: q.get("slug"), handle: q.get("handle") }));
}
