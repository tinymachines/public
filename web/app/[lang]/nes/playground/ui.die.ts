import type { Lang } from "@/lib/lang";

/**
 * The die station's words, both languages beside each other: what the
 * layers of the silicon are called, what the pointer reports, and the
 * lines the station prints when it cannot draw.
 *
 * The wires' names are the chip's own, read from it as it runs, so they
 * are not here: only our labels and words are translated.
 */

const EN_DIE = {
  layers: {
    metal: "metal",
    diffusion: "diffusion",
    ground: "diffusion, to ground",
    supply: "diffusion, to the supply",
    poly: "polysilicon",
  },
  high: "high right now",
  cells: {
    wire: "The wire under the pointer",
    level: "Its level",
    lit: "Wires high now",
    steps: "Half-steps run",
  },
  levelHigh: "high",
  levelLow: "low",
  unnamed: (node: number) => `${node}, unnamed`,
  picture: "The picture chip's die, its wires lit as the chip runs",
  drawing: "Drawing the die's shapes...",
  failed: (reason: string) => `The die could not be drawn: ${reason}.`,
  answered: (status: number) => `the die's shapes answered ${status}`,
  badShape: "the die's shapes are not in the shape this page reads",
  run: "Run the chip",
  pause: "Pause the chip",
};

const JA_DIE: typeof EN_DIE = {
  layers: {
    metal: "メタル",
    diffusion: "拡散層",
    ground: "拡散層、接地へ",
    supply: "拡散層、電源へ",
    poly: "ポリシリコン",
  },
  high: "いま高い",
  cells: {
    wire: "指している線",
    level: "その高さ",
    lit: "いま高い線",
    steps: "進めた半ステップ",
  },
  levelHigh: "高",
  levelLow: "低",
  unnamed: (node) => `${node}、名前なし`,
  picture: "絵のチップのダイ。動いている間、信号を運んでいる線が光ります",
  drawing: "ダイの形を描いています...",
  failed: (reason) => `ダイを描けませんでした: ${reason}。`,
  answered: (status) => `ダイの形の応答は ${status} でした`,
  badShape: "ダイの形が、このページが読める並びになっていません",
  run: "チップを動かす",
  pause: "チップを止める",
};

export function dieWords(lang: Lang): typeof EN_DIE {
  return lang === "ja" ? JA_DIE : EN_DIE;
}
