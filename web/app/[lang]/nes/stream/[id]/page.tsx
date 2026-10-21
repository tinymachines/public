import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { isLang } from "@/lib/lang";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import { StreamMonitor } from "./StreamMonitor";
import { streamMonitorRecord } from "@/lib/streamMonitor";
import "../../nes.css";
import "./monitor.css";

/**
 * /nes/stream/{id}: the stream monitor, one page per run. The model's
 * picture as it runs, live over HLS (nes-bench/docs/stream-monitor-spec.md),
 * the real console's region reserved beside it, a ledger of what the API says
 * about the run, the markers on a frame axis, and a bar to act on it.
 *
 * Everything on it is a view of /api/v1/stream. The page decides nothing:
 * not whether a run exists (a run id the API does not know is shown as the
 * API's own 404 sentence, not a page-level 404, because without the key the
 * page cannot know), not what a frame count is, not whether a press was
 * taken.
 *
 * The desk's split, for the desk's reason: this shell is a server component
 * so it can carry metadata (noindex), and everything that talks to the API
 * is in StreamMonitor, a client component that holds the key in a useState
 * and nowhere else. The page prerenders as the signed-out monitor and ships
 * no run.
 *
 * The note under the ledger states what was measured about the picture's
 * clock and a press (data/stream-monitor.json, read in lib/streamMonitor.ts);
 * no figure on this page is typed.
 *
 * Not in the navigation, not in the sitemap, and not in lib/pages.ts, which
 * keys fixed paths: the entry is passed here, as /6502/builders/{handle}
 * does, so the id rides the title.
 */

export async function generateMetadata({ params }: PageProps<"/[lang]/nes/stream/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  return pageMeta(lang, `/nes/stream/${id}`, {
    title: `Stream monitor: run ${id}`,
    description: "One run of a family cartridge through the console's stream chain, as it runs: the picture, the ledger, the markers, and the bar to act on it.",
    noindex: true,
  });
}

export default async function StreamMonitorPage({ params }: PageProps<"/[lang]/nes/stream/[id]">) {
  const { lang: given, id } = await params;
  const lang = isLang(given) ? given : "en";
  return (
    <Shell lang={lang} die="NES" title="Stream monitor">
      <Untranslated lang={lang} />
      <StreamMonitor lang={lang} id={id} measured={streamMonitorRecord()} />
    </Shell>
  );
}
