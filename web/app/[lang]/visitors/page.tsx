import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Shell } from "@/app/components/SiteFrame";
import { VisitorsBoard } from "./VisitorsBoard";
import "./visitors.css";

/**
 * /visitors: who came, from the server's own logs.
 *
 * Nothing on any page reports back to make this. There is no script, no
 * cookie, no beacon: scripts/visitors-collect.py reads the nginx access
 * logs on a timer, counts what a person would call a read, and writes a
 * snapshot the API serves at /api/v1/visitors. This page draws that
 * snapshot and nothing else, so every number on it can say where it came
 * from (the log, the window, the time it was measured), which is the rule
 * this site runs on for shipped numbers.
 *
 * noindex while it settles, as bradley.io's is: reachable by URL, out of
 * the sitemap and the menu, so the page can be wrong in front of the owner
 * before it is right in front of a search engine.
 *
 * What is deliberately not here: any address. Readers are counted as
 * distinct /24 networks and never listed; the collector's docstring is the
 * design and the API's privacy field restates it on every response.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/visitors");
}

const PROSE = {
  en: {
    lede: "Every document this site and the three 6502 subdomains served to a person in the last thirty days, counted from the server's own access logs. No script on any page reports back, and no address is kept: a reader is a /24 network, counted once and never listed.",
    read: "A read is a document served with a 2xx or 3xx: not an asset, not an API call, not a prefetch the browser made for a page nobody opened, not a 404. Requests from user agents that name themselves as automated are counted apart as bots, and the box's own traffic reaches nothing.",
  },
  ja: {
    lede: "このサイトと 6502 の 3 つのサブドメインが過去 30 日に人へ配信した文書を、サーバー自身のアクセスログから数えたもの。どのページも何も送り返さず、アドレスは保持しない: 読者は /24 ネットワークとして一度だけ数え、一覧にはしない。",
    read: "「読まれた」とは 2xx か 3xx で配信された文書のこと: アセットでも API 呼び出しでも、誰も開かなかったページのプリフェッチでも、404 でもない。自動化されたと名乗るユーザーエージェントからの要求は bot として別に数え、このホスト自身の通信は何にも含めない。",
  },
} as const;

export default async function VisitorsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="LOG" title="Visitors">
      <div className="prose visitors">
        <p>{S.lede}</p>
        <VisitorsBoard lang={lang} />
        <p className="quiet">{S.read}</p>
      </div>
    </Shell>
  );
}
