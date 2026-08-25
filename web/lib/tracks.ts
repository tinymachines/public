/**
 * The four tracks of the 6502 project, and the one place they are named.
 *
 * The owner's shape: Learn, Cart, Lab and tools, Archive. Each has a
 * sub-landing at /6502/<key>, a line, and the handline links the landing
 * shows for it. The menu, the crumbs and the landing all read this, so a
 * track cannot be called one thing in the menu and another on the page.
 */

export interface Track {
  key: string;
  path: string;
  name: { en: string; ja: string };
  what: { en: string; ja: string };
  /** The links the landing shows under the track. Sub-landings show more. */
  headline: { href: string; label: { en: string; ja: string }; hard?: boolean }[];
}

export const TRACKS: Track[] = [
  {
    key: "learn",
    path: "/6502/learn",
    name: { en: "Learn", ja: "学ぶ" },
    what: {
      en: "The lesson: from a token to a published cart, then one instruction followed into the silicon.",
      ja: "レッスン: トークンから公開済みのカートまで、そして一命令をシリコンの中まで追う。",
    },
    headline: [
      { href: "/docs/6502/build-your-first-cart", label: { en: "Build your first cart", ja: "最初のカートを作る" } },
      { href: "/docs/6502/walk-snake", label: { en: "The walk", ja: "ウォーク" } },
      { href: "/docs/6502", label: { en: "The documentation", ja: "ドキュメント" } },
    ],
  },
  {
    key: "cart",
    path: "/6502/cart",
    name: { en: "Cart", ja: "カート" },
    what: {
      en: "Mint a token, build a cartridge by hand or by AI, play it, publish it, and the chip measures it.",
      ja: "トークンを鋳造し、手か AI でカートリッジを作り、遊び、公開し、チップが実測する。",
    },
    headline: [
      { href: "/6502/manage#mint", label: { en: "Mint a free token", ja: "無料のトークンを鋳造" } },
      { href: "/6502/cart/brief.md", label: { en: "The AI brief", ja: "AI ブリーフ" }, hard: true },
      { href: "/6502/games", label: { en: "Die Runner", ja: "Die Runner" } },
      { href: "/6502/builders", label: { en: "Builders", ja: "ビルダー" } },
    ],
  },
  {
    key: "tools",
    path: "/6502/tools",
    name: { en: "Lab and tools", ja: "ラボと道具" },
    what: {
      en: "The instruments: the die lit by what it is doing, the tracer, the schematic, the Halfwave Lab. One chip, many views.",
      ja: "計器: いま何をしているかで光るダイ、トレーサ、回路図、Halfwave Lab。一つのチップ、多くの眺め。",
    },
    headline: [
      { href: "/6502/explorer", label: { en: "The explorer", ja: "エクスプローラ" }, hard: true },
      { href: "/6502/tracer", label: { en: "The tracer", ja: "トレーサ" }, hard: true },
      { href: "/6502/lab", label: { en: "Halfwave Lab", ja: "Halfwave Lab" } },
    ],
  },
  {
    key: "archive",
    path: "/6502/archive",
    name: { en: "Archive", ja: "アーカイブ" },
    what: {
      en: "visual6502.org as it was: the wiki rebuilt from its wikitext and the die photography made browsable again.",
      ja: "かつての visual6502.org: wikitext から再構築した wiki と、再び閲覧できるダイ写真。",
    },
    headline: [
      { href: "/6502/archive", label: { en: "The archive", ja: "アーカイブ" } },
    ],
  },
];

export function track(key: string): Track {
  const t = TRACKS.find((x) => x.key === key);
  if (!t) throw new Error(`no track ${key}`);
  return t;
}
