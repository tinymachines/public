import type { Lang } from "@/lib/lang";

/**
 * The real-or-model station's words, both languages beside each other:
 * what each of the three pictures is called, the three ways of laying two
 * of them over each other, the probe's fixed cells, and the headings over
 * the report's table.
 *
 * The table's cells and the passages under it are the engineers' own,
 * read from their report at build time, and are never here.
 */

export const EN_REALMODEL = {
  missing: (reason: string) => `The pictures are the engineers' report's, and this build could not read it: ${reason}.`,
  eyes: [
    "The model",
    "The real console, recorded by the scope",
    "The real console, through a USB grabber",
  ],
  modes: { wipe: "Wipe", blink: "Blink", diff: "Difference" },
  left: "Left",
  right: "Right",
  how: "How to compare",
  compared: (left: string, right: string, how: string) => `${left} and ${right}, compared by ${how}`,
  loading: "Loading the pictures...",
  notCut: (reason: string) => `The picture could not be cut into its panels: ${reason}.`,
  panels: (found: number, sizes: number, want: number) =>
    `the picture shows ${found} panels of ${sizes} sizes, not ${want} alike`,
  noPicture: "the three-way picture did not load",
  whereWipe: "Where the wipe sits",
  showing: (which: string) => `Now showing: ${which}.`,
  diffNote: "Black where the two agree; the brighter, the further apart (four times the difference).",
  cells: {
    a: "Left picture here",
    b: "Right picture here",
    hue: "Hues apart",
    light: "Brightness apart",
  },
  degrees: (n: string) => `${n} degrees`,
  tooGrey: "too grey to say",
  outOf: (n: string) => `${n} of 255`,
  probe: "Point at the cyan letters, then the brown sign, with the model on one side and a real console on the other.",
  measured: "What the engineers measured on these pictures",
  tableAria: "The report's table",
  columns: {
    compared: "Compared",
    flat: "Flat blocks, mean difference",
    hue: "Hue, middle value",
    light: "Brightness pattern alike",
  },
};

export const JA_REALMODEL: typeof EN_REALMODEL = {
  missing: (reason) => `写真はエンジニアたちの報告のもので、このビルドでは読めませんでした: ${reason}。`,
  eyes: ["模型", "実機を、オシロで記録したもの", "実機を、USB の取り込み機で撮ったもの"],
  modes: { wipe: "境目をずらす", blink: "交互に出す", diff: "差を見る" },
  left: "左",
  right: "右",
  how: "見比べ方",
  compared: (left, right, how) => `${left}と${right}を、${how}で見比べたもの`,
  loading: "写真を読み込んでいます...",
  notCut: (reason) => `写真を 3 枚に切り分けられませんでした: ${reason}。`,
  panels: (found, sizes, want) => `この写真には ${sizes} 通りの大きさの面が ${found} 枚あり、同じ大きさの ${want} 枚になっていません`,
  noPicture: "3 枚並びの写真が読み込めませんでした",
  whereWipe: "境目の位置",
  showing: (which) => `いま出ているのは: ${which}。`,
  diffNote: "2 枚が一致するところは黒、明るいほど離れています (差の 4 倍で描いています)。",
  cells: {
    a: "左の写真のここの色",
    b: "右の写真のここの色",
    hue: "色相の隔たり",
    light: "明るさの隔たり",
  },
  degrees: (n) => `${n} 度`,
  tooGrey: "灰色すぎて言えません",
  outOf: (n) => `255 のうち ${n}`,
  probe: "水色の文字を指してから、茶色の看板を指してみてください。片側が模型、もう片側が実機です。",
  measured: "エンジニアたちがこの写真で測ったもの",
  tableAria: "報告の表",
  columns: {
    compared: "比べたもの",
    flat: "平らな面での差の平均",
    hue: "色相、中央の値",
    light: "明るさの模様の一致",
  },
};

export function realModelWords(lang: Lang) {
  return lang === "ja" ? JA_REALMODEL : EN_REALMODEL;
}
