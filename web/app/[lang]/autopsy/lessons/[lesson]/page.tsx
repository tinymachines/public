import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { excerpt, lesson, lessons, romName } from "@/lib/lessons";
import { Shell } from "@/app/components/SiteFrame";
import { JUMP, JumpPart } from "./jump";
import { SCROLL, ScrollPart } from "./scroll";

/**
 * /autopsy/lessons/<key>: one lesson. Every figure is read from
 * data/lessons.json (scripts/board-lessons.py measured them on our
 * console); the program shown is lessons/<key>/prg.s, the file the
 * cartridge offered here was built from. What is common is here; each
 * kind of lesson brings its own part (jump.tsx, scroll.tsx).
 */

export function generateStaticParams() {
  return lessons().map((l) => ({ lesson: l.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; lesson: string }> }): Promise<Metadata> {
  const { lang, lesson: key } = await params;
  const l = lesson(key);
  if (!l) return {};
  return pageMeta(lang, `/autopsy/lessons/${l.key}`, { title: l.title, description: l.description });
}

const PROSE = {
  en: {
    files: "The cartridge, to play anywhere that plays NES cartridges:",
    picsH: "On the screen",
    pic: (f: string) => `frame ${f}`,
    codeH: "As written",
    code: "The part of the program this lesson is about. The whole program is a plain text file:",
    back: "All the lessons",
  },
  ja: {
    files: "カートリッジ。NES のカートリッジを遊べるところならどこでも遊べる:",
    picsH: "画面の上では",
    pic: (f: string) => `フレーム ${f}`,
    codeH: "書いたとおりに",
    code: "このレッスンが扱うプログラムの部分。プログラム全体は、ただのテキストファイルだ:",
    back: "すべてのレッスン",
  },
} as const;

/** The labels the shown part of each kind's program runs between. */
const SHOWN = { jump: ["jump", "draw"], scroll: ["strips", "prepcol"] } as const;

export default async function LessonPage({ params }: { params: Promise<{ lang: Lang; lesson: string }> }) {
  const { lang, lesson: key } = await params;
  const l = lesson(key);
  if (!l) notFound();
  const S = PROSE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const what = (l.kind === "jump" ? JUMP : SCROLL)[lang].what(n(l.code_bytes), n(l.instructions));
  const [from, to] = SHOWN[l.kind];
  return (
    <Shell lang={lang} die="NES" title={t(lang, l.title)}>
      <div className="prose">
        <p>{what}</p>
        <p data-lesson-files>
          {S.files} <a href={`/autopsy/lessons/${romName(l.key)}`} download>{romName(l.key)}</a>
        </p>

        <h2>{S.picsH}</h2>
        <div className="lesson-pictures" data-lesson-pictures={l.pictures.length} style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {l.pictures.map((p) => (
            <figure key={p.frame} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- our own cartridge's frame, inline from the record */}
              <img src={`data:image/png;base64,${p.png}`} width={256} height={240} alt={S.pic(String(p.frame))} style={{ imageRendering: "pixelated", maxWidth: "100%", height: "auto" }} />
              <figcaption>{S.pic(n(p.frame))}</figcaption>
            </figure>
          ))}
        </div>

        {l.kind === "jump" ? <JumpPart lang={lang} m={l.measures} a={l.against} /> : <ScrollPart lang={lang} m={l.measures} a={l.against} />}

        <h2>{S.codeH}</h2>
        <p>
          {S.code} <a href={`/autopsy/lessons/${l.key}.s`}>{l.key}.s</a>
        </p>
        <pre data-lesson-code>{excerpt(l.key, from, to)}</pre>

        <p>
          <Link href={localize(lang, "/autopsy/lessons")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
