import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize, t } from "@/lib/i18n";
import { arrivedSurfaces, project } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { TrackLede } from "../Tracks";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/cart", {
    title: "Cart", description: "Mint a token, build a cartridge by hand or by AI, play it, publish it, and the chip measures it."
  });
}

const P = {
  en: {
    quick: "Quickstart",
    q1: "Mint a free token", q1b: "One click in the editor. Shown once; your page is claimed and your cart code assigned as it is minted.",
    q2: "Build the cart", q2b: "By hand against the contract, or hand a model the brief: one URL with everything it needs.",
    q3: "Publish", q3b: "The registry runs it on the chip before listing it. What your page shows is what the chip did.",
    brief: "The AI brief", briefLede: "Plain markdown, one read: the walkthrough and the three references it cites. Give a model this URL and one sentence.",
    places: "The places", placesLede: "Where cartridges are made, played and kept.",
    open: "Open",
  },
  ja: {
    quick: "クイックスタート",
    q1: "無料のトークンを鋳造", q1b: "エディタでワンクリック。表示は一度きり。鋳造と同時にページが取得され、カートコードが割り当てられる。",
    q2: "カートを作る", q2b: "規約に沿って手で。または、必要なすべてを載せた一つの URL、ブリーフをモデルに渡す。",
    q3: "公開する", q3b: "レジストリは掲載前にチップの上で走らせる。あなたのページに出るのは、チップがしたことだ。",
    brief: "AI ブリーフ", briefLede: "プレーンなマークダウン、一回の読み込み: ウォークスルーと、それが引く三つのリファレンス。モデルにこの URL と一文を渡す。",
    places: "場所", placesLede: "カートリッジが作られ、遊ばれ、保管される場所。",
    open: "開く",
  },
} as const;

/** The Cart track: the quickstart, the brief, and the places that make and keep cartridges. */
export default async function CartPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = P[lang];
  const p = project("6502");
  const places = arrivedSurfaces(p).filter((s) => ["/6502/games", "/6502/manage", "/6502/builders", "/6502/api"].includes(s.lands_at));
  const steps = [
    { n: "1", title: S.q1, body: S.q1b, href: "/6502/manage#mint" },
    { n: "2", title: S.q2, body: S.q2b, href: "/docs/6502/build-your-first-cart" },
    { n: "3", title: S.q3, body: S.q3b, href: "/6502/builders" },
  ];
  return (
    <Shell lang={lang} die="6502" title={lang === "ja" ? "カート" : "Cart"}>
      <TrackLede lang={lang} k="cart" />
      <h2 className="eyebrow">{S.quick}</h2>
      <ol className="lesson lesson-3">
        {steps.map((st) => (
          <li key={st.n} className="step">
            <span className="step-n" aria-hidden="true">{st.n}</span>
            <h3>{st.title}</h3>
            <p>{st.body}</p>
            <p className="step-links"><Link className="tag live" href={localize(lang, st.href)}>{S.open}</Link></p>
          </li>
        ))}
      </ol>
      <h2 className="eyebrow">{S.brief}</h2>
      <p className="prose">{S.briefLede}</p>
      <pre className="mint-token"><code>https://tinymachines.ai/6502/cart/brief.md</code></pre>
      <p className="prose">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="tag live" href="/6502/cart/brief.md">{S.brief}</a>
      </p>
      <h2 className="eyebrow">{S.places}</h2>
      <p className="prose">{S.placesLede}</p>
      <div className="piece-grid">
        {places.map((s) => (
          <article key={s.key} className="rail">
            <h3>{t(lang, s.nav_label ?? s.name)}</h3>
            <p>{t(lang, s.what)}</p>
            <p className="piece-links">
              {s.prerendered === false ? (
                <a className="tag live" href={s.lands_at}>{t(lang, s.nav_label ?? s.name)}</a>
              ) : (
                <Link className="tag live" href={localize(lang, s.lands_at)}>{t(lang, s.nav_label ?? s.name)}</Link>
              )}
            </p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
