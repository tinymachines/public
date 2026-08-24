import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { localize } from "@/lib/i18n";
import { chipApi } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { Builders } from "./Builders";
import "./registry.css";

/**
 * /6502/builders: the registry, moved off games.tinymachines.ai.
 *
 * ## What moved, and what could not
 *
 * The reading half. `GET /v1/registry` and `GET /v1/registry/b/{handle}` both
 * send `Access-Control-Allow-Origin: *`, deliberately, so this origin can ask
 * for them: CLAUDE.md records that the subdomains stay for now and that the
 * 6502 API is open for exactly this reason.
 *
 * The writing half could not, and the reason is measured rather than guessed.
 * A preflight from this origin comes back allowing `GET, POST, OPTIONS` and
 * listing `Accept, Accept-Language, Content-Language, Content-Type` as the
 * headers it will accept. `Authorization` is not among them, so a browser on
 * this site cannot send a bearer token to that service at all: not to claim a
 * handle, not to edit a page, not to publish a ROM. It is not a decision
 * waiting to be made, it is a header that is not there.
 *
 * The obvious way round is to proxy the writes through this site's own API,
 * where there is no browser and therefore no preflight. That is the wrong
 * move today and it is worth writing down why: tinymachines/6502#9 items 5
 * and 6, the read-only service scope and the identity binding, were left
 * undone on purpose because if games moves under the apex they both turn into
 * an internal join. Building a credentialed proxy now would be building the
 * boundary that is about to stop existing, and then having to unbuild it.
 *
 * So this page reads, and says where publishing is. See PROJECTS.md.
 */

export const metadata: Metadata = {
  title: "Builders",
  description:
    "Everyone publishing cartridges for the transistor-level 6502, and what they have published.",
};

const PROSE = {
  en: {
    title: "Builders",
    intro: (
      <>
        A cartridge is one gzipped file carrying a ROM, its tiles and the
        contract it was written to. Publishing one does not upload a claim
        about it: the registry runs it on the die, and what you see under
        each cartridge below is what the chip did, not what its author typed.
        A ROM that never finishes a frame is not listed.
      </>
    ),
    pubTitle: "Publishing happens in the editor",
    pub: (m: string) => (
      <>
        Claiming a handle, editing your page and publishing a cartridge all
        happen in <Link href={m}>the editor</Link>, signed in with your
        token. What is published is the file; every claim shown beside it is
        measured here, on the chip, before it is listed.
      </>
    ),
  },
  ja: {
    title: "ビルダー",
    intro: (
      <>
        カートリッジは、ROM とタイルと、それが書かれた規約を運ぶ一つの gzip
        ファイルだ。公開しても、それについての主張はアップロードされない:
        レジストリがダイの上で走らせ、下の各カートリッジに見える数字は、作者が打ち込んだものではなくチップがしたことだ。フレームを一度も完了しない ROM は掲載されない。
      </>
    ),
    pubTitle: "公開はエディタで行う",
    pub: (m: string) => (
      <>
        ハンドルの取得も、ページの編集も、カートリッジの公開も、自分のトークンでサインインして<Link href={m}>エディタ</Link>で行う。公開されるのはファイルであり、その横に表示される主張はどれも、掲載前にここでチップの上で実測されたものだ。
      </>
    ),
  },
} as const;

export default async function BuildersPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="REG" title={S.title}>
      <main className="prose">
        <p>{S.intro}</p>

        <Builders api={chipApi()} lang={lang} />

        <h2>{S.pubTitle}</h2>
        <p>{S.pub(localize(lang, "/6502/manage"))}</p>
      </main>
    </Shell>
  );
}
