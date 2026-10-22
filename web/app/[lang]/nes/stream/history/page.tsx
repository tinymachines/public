import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import { RunHistory } from "./RunHistory";
import "./history.css";

/**
 * /nes/stream/history: the run history. Every run the stream desk has made,
 * newest first, read from GET /v1/stream/runs and drawn four ways: the last
 * run in full, the ledger of all of them, what each stage of the chain cost
 * per frame, and the trend of lag across runs. The desk shows what runs now
 * and sixty lines of one log; this is how the chain does over time (owner's
 * brief, 2026-10-22).
 *
 * Read-only: it starts and stops nothing. Behind the desk's own gate, an
 * operator's passkey or a key, and operators only by the owner's call:
 * nothing on it is public. The desk's split, for the desk's reason: this
 * shell is a server component so it can carry metadata (noindex), and
 * everything that talks to the API is in RunHistory, a client component. The
 * page prerenders as the signed-out history and ships no run.
 *
 * No figure here is typed: every number is the API's, which read it out of
 * the run's own log on disk, and the page says so at its foot. Not in the
 * navigation and not in the sitemap. It is an operator's tool.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/stream/history");
}

export default async function RunHistoryPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  return (
    <Shell lang={lang} die="NES" title="Run history">
      <Untranslated lang={lang} />
      <RunHistory lang={lang} />
    </Shell>
  );
}
