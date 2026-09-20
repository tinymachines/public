import type { Lang } from "@/lib/lang";

/**
 * The slow chip's words, both languages beside each other: what its
 * fixed cells are called, what the two pictures are, and the lines it
 * prints while the transistors work.
 *
 * Every count and every rate stays a figure, read from the chip as it
 * runs: only the labels and the words around them are translated.
 */

const EN_SLOW = {
  cells: {
    line: "Line",
    dot: "Dot",
    drawn: "Dots drawn",
    agree: "Agree with the fast chip",
    differ: "Differ",
    align: "Alignment",
    rate: "Dots a second, here",
    slower: "Slower than the real chip",
    switched: "Transistors switched, this dot",
  },
  dots: (n: number) => `${n} dots`,
  failed: (reason: string) => `The slow chip could not start here: ${reason}.`,
  noBundle: "the slow chip's bundle did not load",
  slowPicture: "The slow chip's picture, drawn dot by dot by its transistors",
  slowCaption: "The slow chip: every transistor, simulated",
  fastPicture: "The fast chip's frame of the same scene",
  fastCaption: "The fast chip: the same frame, all at once",
  run: "Run the chip",
  pause: "Pause the chip",
  size: (transistors: string, wires: string) => `${transistors} transistors, ${wires} wires, read from the chip's own netlist.`,
  waking: "Waking the chip...",
  lamps: "The chip's own nodes, lit when high",
  hpos: "Dot counter",
  vpos: "Line counter",
  palD: "Colour out",
  clocks: "Clocks and bus",
  heart: "Transistors switched per dot, the last two lines",
  heartPicture: "How many transistors changed state on each of the last two lines' dots",
};

const JA_SLOW: typeof EN_SLOW = {
  cells: {
    line: "走査線",
    dot: "ドット",
    drawn: "描いたドット",
    agree: "速いチップと一致",
    differ: "食い違い",
    align: "位置合わせ",
    rate: "ここでの毎秒ドット数",
    slower: "実機のチップとの比",
    switched: "このドットで切り替わったトランジスタ",
  },
  dots: (n) => `${n} ドット`,
  failed: (reason) => `ここでは遅いチップを動かせませんでした: ${reason}。`,
  noBundle: "遅いチップのバンドルが読み込めませんでした",
  slowPicture: "遅いチップの絵。トランジスタが 1 ドットずつ描いたもの",
  slowCaption: "遅いチップ: トランジスタを 1 つずつ動かしたもの",
  fastPicture: "速いチップによる同じ場面のフレーム",
  fastCaption: "速いチップ: 同じフレームを一度に",
  run: "チップを動かす",
  pause: "チップを止める",
  size: (transistors, wires) => `トランジスタ ${transistors} 個、線 ${wires} 本。チップ自身の配線表から読んだものです。`,
  waking: "チップを起こしています...",
  lamps: "チップ自身のノード。高いときに光ります",
  hpos: "ドット計数器",
  vpos: "走査線計数器",
  palD: "色の出力",
  clocks: "クロックとバス",
  heart: "ドットごとに切り替わったトランジスタ。直前の 2 走査線ぶん",
  heartPicture: "直前の 2 走査線の各ドットで、いくつのトランジスタが状態を変えたか",
};

export function slowWords(lang: Lang): typeof EN_SLOW {
  return lang === "ja" ? JA_SLOW : EN_SLOW;
}
