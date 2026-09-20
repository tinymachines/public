import type { Lang } from "@/lib/lang";

/**
 * The sound station's words, both languages beside each other: the
 * voices' names and what each one is usually for, the buttons, and the
 * short lines the cells print as the chip plays.
 *
 * The note names are a keyboard's (C, C#, D), and every reading stays a
 * figure: only the labels and the words around them are translated.
 */

const EN_SOUND = {
  waiting: "Waiting for the console to report its clock...",
  on: "Turn the sound on",
  off: "Turn the sound off",
  clock: (mhz: string) => `The chip's clock, from the console's own count: ${mhz} million cycles a second.`,
  mute: "Mute",
  muted: "Muted",
  play: "Play",
  stop: "Stop",
  pitchMeasured: "Pitch, measured",
  noteAsked: "Note asked for",
  playing: "Playing",
  none: "none",
  yes: "yes",
  no: "no",
  silent: "silent",
  noPitchNoise: "no pitch: noise",
  noPitchSample: "no pitch: a sample",
  tooLow: "too low to count",
  note: (name: string, hz: string) => `${name} (${hz} Hz)`,
  volume: "Volume",
  pitch: "Pitch",
  rate: "Rate",
  metallic: "Metallic (the short loop)",
  triangle: "The triangle has no volume control: it is always this loud.",
  trace: (name: string) => `${name}'s output, as the chip produces it`,
  keyboard: (name: string) => `${name}'s keyboard`,
  keyOf: (name: string, note: string) => `${name}: ${note}`,
  shape: (name: string) => `${name}'s shape`,
  duty: (eighths: number) => `high for ${eighths} eighths of each cycle`,
  voices: {
    sq0: { name: "Square one", role: "the melody, usually" },
    sq1: { name: "Square two", role: "harmony, or a second melody" },
    tri: { name: "Triangle", role: "the bass line" },
    noi: { name: "Noise", role: "drums, wind, explosions" },
    dmc: { name: "Samples", role: "recorded sounds, played from memory" },
  },
};

const JA_SOUND: typeof EN_SOUND = {
  waiting: "コンソールが時計を知らせるのを待っています...",
  on: "音を出す",
  off: "音を止める",
  clock: (mhz) => `チップの時計は、コンソール自身の数え上げから: 毎秒 ${mhz} 百万サイクル。`,
  mute: "消音",
  muted: "消音中",
  play: "鳴らす",
  stop: "止める",
  pitchMeasured: "測った高さ",
  noteAsked: "頼んだ音",
  playing: "鳴っているか",
  none: "なし",
  yes: "はい",
  no: "いいえ",
  silent: "無音",
  noPitchNoise: "高さなし: 雑音",
  noPitchSample: "高さなし: 録音",
  tooLow: "低すぎて数えられない",
  note: (name, hz) => `${name} (${hz} Hz)`,
  volume: "音量",
  pitch: "高さ",
  rate: "速さ",
  metallic: "金属的 (短い周期)",
  triangle: "三角波に音量の調節はありません。いつもこの大きさです。",
  trace: (name) => `${name}の出力。チップが出したそのまま`,
  keyboard: (name) => `${name}の鍵盤`,
  keyOf: (name, note) => `${name}: ${note}`,
  shape: (name) => `${name}の波形`,
  duty: (eighths) => `1 周期のうち 8 分の ${eighths} が高い`,
  voices: {
    sq0: { name: "矩形波 1", role: "ふつうは主旋律" },
    sq1: { name: "矩形波 2", role: "和音、または 2 本目の旋律" },
    tri: { name: "三角波", role: "低音の旋律" },
    noi: { name: "雑音", role: "太鼓、風、爆発" },
    dmc: { name: "サンプル", role: "録音した音を、メモリから鳴らす" },
  },
};

export function soundWords(lang: Lang): typeof EN_SOUND {
  return lang === "ja" ? JA_SOUND : EN_SOUND;
}
