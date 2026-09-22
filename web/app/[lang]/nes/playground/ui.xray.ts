import type { Lang } from "@/lib/lang";

/**
 * X-ray your own game: its controls, its fixed cells and the lines of
 * its report, both languages beside each other.
 *
 * What the two runs did is measured in the page and printed as figures;
 * this file holds only what those figures are called and the words
 * around them.
 */

export const EN_XRAY = {
  cells: {
    tap: "The tap",
    first: "First frame apart",
    gap: "Frames after the tap",
    dots: "Dots apart then",
    worst: "Worst frame",
    rejoin: "Together again",
  },
  playing: "Your cartridge, playing",
  choose: "Choose a .nes file from your own disk.",
  yourOwn: "Your own .nes",
  play: "Play",
  pause: "Pause",
  recorded: (name: string, frames: string) => `${name}: ${frames} frames recorded`,
  onlySimple: "The console loads the boards it has.",
  xrayOf: "X-ray a tap of",
  running: "Running both...",
  doIt: "X-ray it here",
  how: "Play to the moment you are interested in, then x-ray a tap there. Both consoles then replay everything you played, from power on, and are left running a while afterwards.",
  report: "The report",
  apartHeading: "Dots apart, frame by frame (the red mark is the tap)",
  apartTrace: "How far apart the two runs were on each frame",
  tapAt: (button: string, frame: string) => `${button} at frame ${frame}`,
  never: "never",
  none: "·",
  worstAt: (dots: string, frame: string) => `${dots} dots, frame ${frame}`,
  neverDiffered: "they never differed",
  notInThese: "not in these frames",
  atFrame: (frame: string) => `frame ${frame}`,
  worstPicture: "The frame the two runs differed on most, with the differing dots lit",
  worstCaption: "The frame they differed on most: the run with the tap, with every dot the other run had differently lit.",
  worstEmpty: "The frame they differ on most appears here.",
  limits:
    "This is what the bench can see: pictures. The engineers' own x-ray also names the instruction the two runs first parted at and the path through the code that followed, which it reads from the model's bus; that is not in the bundle this page runs.",
};

export const JA_XRAY: typeof EN_XRAY = {
  cells: {
    tap: "叩いたボタン",
    first: "最初に違ったフレーム",
    gap: "叩いてからのフレーム数",
    dots: "そのとき違ったドット数",
    worst: "いちばん違ったフレーム",
    rejoin: "また一致したところ",
  },
  playing: "あなたのカセットが動いています",
  choose: "手持ちのディスクから .nes を選んでください。",
  yourOwn: "手持ちの .nes",
  play: "再生",
  pause: "一時停止",
  recorded: (name, frames) => `${name}: ${frames} フレーム記録しました`,
  onlySimple: "コンソールは自分が持っている基板を読み込みます。",
  xrayOf: "透かして見るボタン",
  running: "両方を走らせています...",
  doIt: "ここで透かして見る",
  how: "気になるところまで遊んでから、そこで 1 押しを透かして見てください。2 台のコンソールが、遊んだ通りを電源投入から再生し、そのあとしばらく走り続けます。",
  report: "報告",
  apartHeading: "違ったドット数、フレームごと (赤い印が叩いた瞬間)",
  apartTrace: "フレームごとに、2 つの走行がどれだけ離れていたか",
  tapAt: (button, frame) => `${button} をフレーム ${frame} で`,
  never: "一度もなし",
  none: "·",
  worstAt: (dots, frame) => `${dots} ドット、フレーム ${frame}`,
  neverDiffered: "一度も違いませんでした",
  notInThese: "このフレームの範囲では戻りません",
  atFrame: (frame) => `フレーム ${frame}`,
  worstPicture: "2 つの走行がいちばん違ったフレーム。違うドットを光らせたもの",
  worstCaption: "いちばん違ったフレームです。叩いた方の走行を出し、もう一方と違うドットをすべて光らせています。",
  worstEmpty: "いちばん違うフレームが、ここに出ます。",
  limits:
    "実験台に見えるのはこれと同じ、映像です。エンジニアたち自身の透視は、2 つの走行が最初に分かれた命令と、そのあとコードが辿った道筋も、模型のバスから読んで示します。それはこのページが動かしている束には入っていません。",
};

export function xrayWords(lang: Lang) {
  return lang === "ja" ? JA_XRAY : EN_XRAY;
}
