import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import { StreamDesk } from "./StreamDesk";

/**
 * /nes/stream: the stream desk. Start one of the family's cartridges through
 * the console's stream chain (the model, the composite signal, the CRT
 * stage on the GPU, ffmpeg) to a file or a live ingest, watch its progress,
 * stop it, place markers on it. The operator's side of the stream plan
 * (nes-bench/docs/stream-plan.md) and the control plane the tm-stream wire
 * spec's dashboard will sit beside; today it drives api/stream.py and
 * nothing else.
 *
 * Same split as /admin, for the same reason: the shell is a server
 * component so it can carry metadata (noindex), and everything that talks
 * to the API is in StreamDesk, a client component that holds the key in a
 * useState and nowhere else. The page prerenders as the signed-out desk and
 * ships no data: every row needs a key, and the key arrives in a browser.
 *
 * Not in the navigation and not in the sitemap. It is an operator's tool.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/stream");
}

export default async function NesStreamPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  return (
    <Shell lang={lang} die="NES" title="Stream desk">
      <Untranslated lang={lang} />
      <StreamDesk />
    </Shell>
  );
}
