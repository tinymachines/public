import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Shell } from "@/app/components/SiteFrame";
import { computerTree } from "@/lib/computer-tree";
import { ComputerTree } from "./ComputerTree";
import "./ctree.css";

/**
 * /computer-tree: the US Army's 1961 family tree of the electronic
 * computer, transcribed and grown one ring per decade to 2025.
 *
 * The tree is bradley.io's (bradley.io/projects/computer-tree): the
 * dataset, its data card and the layout are copied in by
 * scripts/sync-computer-tree.sh and held to the source at every deploy, so
 * the two sites draw one tree. The English page names bradley.io's as
 * canonical, so the two do not compete in search; the Japanese page has
 * no twin there and is its own.
 *
 * What the page claims is only what the data card states or the data
 * computes, and its two weaknesses (most 1961 links are estimates; the
 * biggest 1961 hubs are partly a transcription artifact) are said on the
 * page in the card's own terms.
 */

const CANONICAL = "https://bradley.io/projects/computer-tree";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const m = pageMeta(lang, "/computer-tree");
  return lang === "ja" ? m : { ...m, alternates: { ...m.alternates, canonical: CANONICAL } };
}

const FILES = ["DATACARD.md", "nodes.csv", "edges.csv", "computer_tree.json"] as const;

const PROSE = {
  en: {
    lede: (n: string, l: string) =>
      `In 1961 the US Army drew the family tree of the electronic computer: ENIAC at the trunk, every machine built since hanging off a limb, rings at 1950, 1955 and 1960. This is that chart, transcribed, and grown one ring per decade to 2025: ${n} machines and ${l} links. Pick any machine and the tree draws its line back to the root.`,
    readH: "How to read it",
    read: (chart: string, added: string, cross: string) =>
      `Every dot is a machine, a processor or a system, and its ring is the period it arrived in. The inner three rings are the 1961 chart's own; past them there is one ring per decade, and the outermost holds 2021 to 2025. Teal dots (${chart}) were transcribed from the 1961 chart; orange dots (${added}) were added after it. A machine sits under its primary parent, the one the data names first. ${cross} machines have a second parent as well; switch on Cross-links to see them.`,
    limitsH: "What it cannot carry",
    limits1: (est: string, firm: string) =>
      `The 1961 links are shaky. The source was a low-resolution scan; most labels are legible, but many branch attachments in the dense middle are not, so ${est}% of the 1961 links are estimates, drawn dashed. The links added since are ${firm}% firm. Read a dashed 1950s attachment as "same region of the chart", not as proven ancestry.`,
    limits2:
      "Some 1961 hubs are inflated: LOGISTICS and RASTAC show the most children on the chart partly because unreadable twigs were attached to the nearest legible branch. Past 1960 the tree follows major lineages, not every product, and Soviet and Eastern Bloc machines, most Japanese mainframes, SGI and MIPS, the Amiga and Atari, and early game consoles are among the gaps. Check a 1950s date or ancestry against a primary source before citing it.",
    dataH: "The data",
    data: "The dataset is a directed acyclic graph: every parent exists, there are no cycles, and no parent is dated more than a year after its child. Take it with you; the data card has the schema, the counts and how to add a decade.",
    files: {
      "DATACARD.md": "Sources, schema, distribution, limitations",
      "nodes.csv": "One row per machine",
      "edges.csv": "One row per link, parent to child",
      "computer_tree.json": "Both, shaped for D3",
    } as Record<(typeof FILES)[number], string>,
    fileH: ["File", "What it holds"],
    home: "The tree and its dataset were made for bradley.io, where the same page lives:",
  },
  ja: {
    lede: (n: string, l: string) =>
      `1961 年、アメリカ陸軍は電子計算機の系統樹を描いた。幹に ENIAC、それ以後に作られたすべての機械が枝から下がり、1950 年、1955 年、1960 年に輪がある。これはその図を書き写し、2025 年まで十年ごとに一つずつ輪を育てたものだ。機械は ${n} 台、つながりは ${l} 本。どれか一台を選ぶと、系統樹はそこから根までの系統を描く。`,
    readH: "読み方",
    read: (chart: string, added: string, cross: string) =>
      `点のひとつひとつが機械、プロセッサ、あるいはシステムで、その輪は現れた時代だ。内側の三つの輪は 1961 年の図そのもの。その外は十年ごとに一つの輪で、いちばん外側は 2021 年から 2025 年。青緑の点 (${chart}) は 1961 年の図から書き写したもの、橙の点 (${added}) はそのあとに加えたもの。機械はそれぞれ主な親、つまりデータが最初に挙げる親の下に置かれる。${cross} 台にはもう一つ親がある。「横のつながり」を入れると見える。`,
    limitsH: "これが担えないもの",
    limits1: (est: string, firm: string) =>
      `1961 年のつながりは揺らいでいる。元は解像度の低いスキャンで、ほとんどの名前は読めるが、込み入った真ん中の枝の付き方の多くは読めない。だから 1961 年のつながりの ${est}% は推定で、破線で描いてある。その後に加えたつながりは ${firm}% が確かだ。1950 年代の破線のつながりは「図の同じあたり」と読み、確かな系譜とは読まないこと。`,
    limits2:
      "1961 年の中心のいくつかは膨らんでいる。LOGISTICS と RASTAC が図の上でいちばん多くの子を持つのは、読めない小枝をいちばん近い読める枝につないだせいでもある。1960 年より後は、すべての製品ではなく主な系統を追っている。ソビエトと東側の機械、日本のメインフレームの多く、SGI と MIPS、Amiga と Atari、初期のゲーム機などが抜けている。1950 年代の年や系譜を引く前に、一次資料で確かめてほしい。",
    dataH: "データ",
    data: "このデータセットは有向非巡回グラフだ。親はすべて存在し、循環は無く、子より一年を超えて後の年の親は無い。持って行ってかまわない。データカードに、スキーマ、数、そして十年を足すやり方がある (英語)。",
    files: {
      "DATACARD.md": "出典、スキーマ、配布、限界",
      "nodes.csv": "機械ごとに一行",
      "edges.csv": "つながりごとに一行、親から子へ",
      "computer_tree.json": "その両方を D3 向けの形で",
    } as Record<(typeof FILES)[number], string>,
    fileH: ["ファイル", "中身"],
    home: "この系統樹とデータセットは bradley.io のために作られ、同じページがそこにある:",
  },
} as const;

export default async function ComputerTreePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const data = computerTree();
  const { nodes, links } = data;
  const n = (v: number) => v.toLocaleString(lang);
  const chart = nodes.filter((x) => x.chart).length;
  const cross = links.filter((l) => !l.primary).length;
  const est = (layer: boolean) => {
    const ls = links.filter((l) => nodes[l.t].chart === layer);
    return Math.round((100 * ls.filter((l) => !l.firm).length) / ls.length);
  };
  return (
    <Shell lang={lang} die="TREE" title="The Computer Tree">
      <div className="prose">
        <p>{S.lede(n(nodes.length), n(links.length))}</p>
      </div>
      <ComputerTree data={data} lang={lang} />
      <div className="prose">
        <h2>{S.readH}</h2>
        <p>{S.read(n(chart), n(nodes.length - chart), n(cross))}</p>
        <h2>{S.limitsH}</h2>
        <p>{S.limits1(n(est(true)), n(100 - est(false)))}</p>
        <p>{S.limits2}</p>
        <h2>{S.dataH}</h2>
        <p>{S.data}</p>
      </div>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label={S.dataH}>
          <table data-ctree-files>
            <thead>
              <tr>
                <th>{S.fileH[0]}</th>
                <th>{S.fileH[1]}</th>
              </tr>
            </thead>
            <tbody>
              {FILES.map((f) => (
                <tr key={f}>
                  <td className="name">
                    <a href={`/computer-tree/${f}`} download>
                      {f}
                    </a>
                  </td>
                  <td>{S.files[f]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="prose">
        <p>
          {S.home} <a href={CANONICAL}>bradley.io/projects/computer-tree</a>
        </p>
      </div>
    </Shell>
  );
}
