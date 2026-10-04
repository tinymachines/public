import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { excerpt, lesson, lessons, romName, topics } from "@/lib/lessons";
import { Shell } from "@/app/components/SiteFrame";
import { JUMP, JumpPart } from "./jump";
import { SCROLL, ScrollPart } from "./scroll";
import { ROOMS, RoomsPart } from "./rooms";
import { SCREENS, ScreensPart } from "./screens";
import { STOMP, StompPart } from "./stomp";
import { RUN, RunPart } from "./run";
import { STATUS, StatusPart } from "./status";
import { SOUND, SoundPart } from "./sound";
import { PAUSE, PausePart } from "./pause";
import { TITLE, TitlePart } from "./title";
import { ITEMS, ItemsPart } from "./items";
import { MENU, MenuPart } from "./menu";
import { SPLASH, SplashPart } from "./splash";
import { ABOUT, AboutPart } from "./about";
import { SOLID, SolidPart } from "./solid";
import { WALKERS, WalkersPart } from "./walkers";
import { FLICKER, FlickerPart } from "./flicker";
import { LIVES, LivesPart } from "./lives";
import { COINS, CoinsPart } from "./coins";

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
    play: "Play it here",
    desk: "Change it on the desk",
    picsH: "On the screen",
    pic: (f: string) => `frame ${f}`,
    codeH: "As written",
    code: "The part of the program this lesson is about. The whole program is a plain text file:",
    back: "All the lessons",
    before: "Before this one:",
    after: "Next:",
  },
  ja: {
    files: "カートリッジ。NES のカートリッジを遊べるところならどこでも遊べる:",
    play: "ここで遊ぶ",
    desk: "机の上で変えてみる",
    picsH: "画面の上では",
    pic: (f: string) => `フレーム ${f}`,
    codeH: "書いたとおりに",
    code: "このレッスンが扱うプログラムの部分。プログラム全体は、ただのテキストファイルだ:",
    back: "すべてのレッスン",
    before: "この前は:",
    after: "次は:",
  },
} as const;

/** The labels the shown part of each kind's program runs between. */
const SHOWN = { jump: ["jump", "draw"], scroll: ["strips", "prepcol"], rooms: ["slide", "prepcol"], screens: ["screen", "pressed"], stomp: ["touch", "hit"], run: ["jump", "air"], status: ["oldhit", "timer"], sound: ["jumpsound", "notelow"], pause: ["pause", "chimenote"], title: ["waiting", "presses"], items: ["picture", "letters"], menu: ["steer", "full"], splash: ["palette", "written"], about: ["crawl", "ready"], solid: ["rising", "bumped"], walkers: ["walkers", "strode"], flicker: ["order", "across"], lives: ["touch", "livesword"], coins: ["bar", "points"] } as const;

export default async function LessonPage({ params }: { params: Promise<{ lang: Lang; lesson: string }> }) {
  const { lang, lesson: key } = await params;
  const l = lesson(key);
  if (!l) notFound();
  const S = PROSE[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const what = { jump: JUMP, scroll: SCROLL, rooms: ROOMS, screens: SCREENS, stomp: STOMP, run: RUN, status: STATUS, sound: SOUND, pause: PAUSE, title: TITLE, items: ITEMS, menu: MENU, splash: SPLASH, about: ABOUT, solid: SOLID, walkers: WALKERS, flicker: FLICKER, lives: LIVES, coins: COINS }[l.kind][lang].what(n(l.code_bytes), n(l.instructions));
  const [from, to] = SHOWN[l.kind];
  return (
    <Shell lang={lang} die="NES" title={t(lang, l.title)}>
      <div className="prose">
        <p>{what}</p>
        <p data-lesson-files>
          <Link className="btn btn-primary" href={`${localize(lang, "/nes/play")}?lesson=${l.key}`} data-lesson-play>
            {S.play}
          </Link>{" "}
          <Link className="btn" href={`${localize(lang, "/nes/create")}?lesson=${l.key}`} data-lesson-desk>
            {S.desk}
          </Link>{" "}
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

        {l.kind === "jump" ? <JumpPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "scroll" ? <ScrollPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "rooms" ? <RoomsPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "screens" ? <ScreensPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "stomp" ? <StompPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "run" ? <RunPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "status" ? <StatusPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "coins" ? <CoinsPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "lives" ? <LivesPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "flicker" ? <FlickerPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "walkers" ? <WalkersPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "solid" ? <SolidPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "about" ? <AboutPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "splash" ? <SplashPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "menu" ? <MenuPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "items" ? <ItemsPart lang={lang} m={l.measures} a={l.against} /> : l.kind === "title" ? <TitlePart lang={lang} m={l.measures} a={l.against} /> : l.kind === "pause" ? <PausePart lang={lang} m={l.measures} a={l.against} /> : <SoundPart lang={lang} m={l.measures} a={l.against} />}

        <h2>{S.codeH}</h2>
        <p>
          {S.code} <a href={`/autopsy/lessons/${l.key}.s`}>{l.key}.s</a>
        </p>
        <pre data-lesson-code>{excerpt(l.key, from, to)}</pre>

        {/* The lessons either side of this one in its group, read from lessons/topics.json by way of the record. */}
        {(() => {
          const g = topics().find((x) => x.lessons.includes(l.key))!;
          const i = g.lessons.indexOf(l.key);
          const side = (k: string | undefined, label: string, which: string) => {
            const o = k ? lesson(k) : undefined;
            return o ? (
              <p data-lesson-side={which}>
                {label} <Link href={localize(lang, `/autopsy/lessons/${o.key}`)}>{t(lang, o.title)}</Link>
              </p>
            ) : null;
          };
          return (
            <>
              {side(g.lessons[i - 1], S.before, "before")}
              {side(g.lessons[i + 1], S.after, "after")}
            </>
          );
        })()}
        <p>
          <Link href={localize(lang, "/autopsy/lessons")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
