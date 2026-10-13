"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import type { CameraMeasures, JumpMeasures, PauseMeasures, PlatformsMeasures, RoomsMeasures, RunMeasures, ScreensMeasures, ScrollMeasures, SoundMeasures, StatusMeasures, StompMeasures, WalkersMeasures } from "@/lib/lessons";
import * as program from "./programEngine";

/**
 * The Program window: a lesson's program to change and play. Pick a
 * lesson, edit its program, and Assemble and play builds the cartridge in
 * this page (wasm/listing's lesson.rs, the code that built the lesson in
 * the first place) and puts it in the console. A program that does not
 * assemble says why, by line, and nothing is loaded. The edit is kept in
 * this browser; Back to ours restores the lesson as written.
 */

const S = {
  en: {
    h: "Program",
    pick: "A lesson's program",
    none: "Choose a lesson to open its program here.",
    opening: "Opening...",
    edit: "The program, yours to change:",
    assemble: "Assemble and play",
    building: "Assembling...",
    ours: "Back to ours",
    save: "Download this program",
    built: (n: string, bytes: string) => <>It assembled: <b>{n}</b> instructions in <b>{bytes}</b> bytes, and it is in the console now.</>,
    same: "It is byte for byte the lesson's own cartridge.",
    yours: "It is your own cartridge: it differs from the lesson's.",
    lesson: "The lesson's page",
    measuredH: "Measured the way the lesson was",
    measuring: "Measuring it with the lesson's own button presses...",
    measured: "Your cartridge was run through the lesson's own button presses with nobody watching, and read the way ours was.",
    what: "What",
    oursCol: "Ours",
    yoursCol: "Yours",
    fullAfter: "Frames of walking to full speed",
    full: "Full speed, pixels a frame",
    jumpFrames: (held: string) => `A held ${held} frames: frames in the air`,
    jumpRisen: (held: string) => `A held ${held} frames: pixels risen`,
    run: {
      walk_top: "Top walking speed, pixels a frame",
      run_top: "Top running speed, pixels a frame",
      run_after: "Frames of B to reach it",
      "walk-first": "Walking jump: first speed up, pixels a frame",
      "walk-held": "Walking jump: pull with A held, 256ths",
      "walk-released": "Walking jump: pull after, 256ths",
      "walk-rose": "Walking jump: pixels risen",
      "run-first": "Running jump: first speed up, pixels a frame",
      "run-held": "Running jump: pull with A held, 256ths",
      "run-released": "Running jump: pull after, 256ths",
      "run-rose": "Running jump: pixels risen",
      light_max: "The fastest speed that still gets the light jump, sixteenths",
      strong_min: "The slowest speed that gets the strong jump, sixteenths",
    },
    stomp: {
      walk: "The walker's speed, pixels a frame",
      "stomp-frame": "The stomp: its frame",
      "stomp-dx": "The stomp: the walker across from the square the frame before, pixels",
      "stomp-dy": "The stomp: the walker below the square the frame before, pixels",
      "stomp-fall": "The stomp: the square's speed down before, pixels a frame",
      "stomp-after": "The stomp: the square's speed down after",
      "stomp-state": "The stomp: the walker's state after",
      "stomp-flat": "Frames the walker stays flattened",
      "hit-frame": "The hit: its frame",
      "hit-dx": "The hit: the walker across from the square the frame before, pixels",
      "hit-dy": "The hit: the walker below the square the frame before, pixels",
      "hit-fall": "The hit: the square's speed down before, pixels a frame",
      "hit-after": "The hit: the square's speed down after",
      "hit-state": "The hit: the walker's state after",
      notTaken: "What our autopsy says of the program's touch routine is in the record and is not measured here.",
    },
    walkers: {
      pixels: "Pixels a move",
      every: "Frames between moves",
      wall_turns: "Turns at a wall",
      inside: "At a wall, a frame spent a pixel inside it",
      meetings: "Meetings, both turning on one frame",
      overlap: "At a meeting, pixels the two overlap",
      yes: "yes",
      no: "no",
    },
    camera: {
      starts_at: "Walking right: the square's place on the screen when the camera first moves, pixels",
      holds_at: "Walking right: the place the camera holds the square at",
      eased: "Frames the camera moved right by less than the square did",
      back: "Walking left: the camera ever moves back",
      back_at: "Walking left: the place the camera holds the square at",
      restarts_at: "Right again: the square's place when the camera next moves",
      yes: "yes",
      no: "no",
    },
    platforms: {
      axis: "Which way the lift moves",
      across: "across",
      down: "up and down",
      step: "The lift's step, pixels",
      every: "Frames between the lift's steps",
      travel: "How far the lift travels, pixels",
      standing: "Frames the square stood on the lift",
      stepped: "Of those, frames the lift stepped with nothing pressed its way for a second before",
      same: "Of those, frames the square moved by the lift's own step",
      steady: "The square's height above the lift held steady",
      yes: "yes",
      no: "no",
    },
    scroll: {
      strips: "Strips of land built while the camera moved",
      every_min: "Pixels between one strip and the next: least",
      every_max: "Pixels between one strip and the next: most",
      every_mean: "Pixels between one strip and the next: mean",
      frames: "Frames a strip takes",
      columns: "Columns written in a strip",
      tiles: "Tiles in a column",
      colours: "Colour writes in a strip",
      ahead_min: "Pixels past the right edge the first column lands: least",
      ahead_max: "Pixels past the right edge the first column lands: most",
      column_frames: "Frames of the strip the columns are written on",
      last_write: "Frame of the strip with its last write",
    },
    rooms: {
      mirroring: "Which name tables sit side by side",
      fixed: "fixed by the board",
      before: "Walking out sideways: the room's number before",
      after: "Walking out sideways: the room's number after",
      wait: "Frames from the number changing to the picture moving",
      slide: "Frames the picture slid",
      travel: "Pixels the picture slid",
      step: "Pixels a frame, the usual step",
      written_before: "Runs of eight or more tiles written before the slide: tiles and way, how many",
      written_during: "Runs of eight or more tiles written during the slide: tiles and way, how many",
      column_every: "Frames between columns written during the slide",
      columns_from: "Frame of the slide the first column was written on",
      columns: "Columns written during the slide",
      "up-before": "Walking out upward: the room's number before",
      "up-after": "Walking out upward: the room's number after",
      "up-rows": "Rows written across after the number changed",
      "up-tiles": "Tiles in a row",
      "up-first": "Frames from the number changing to the first row",
      "up-every": "Frames between rows",
      "up-upward": "The rows go up the table",
      "up-from_row": "First row written",
      "up-to_row": "Last row written",
      yes: "yes",
      no: "no",
    },
    screens: {
      values: "The values the screen's byte took, in order",
      changes: "Times it changed",
      "pause-before": "Cells of memory changing a frame while playing, the median",
      "pause-during": "Cells of memory changing a frame while paused, the median",
      "pause-frames": "Frames paused",
      notTaken: "What our autopsy says of the program (its stretches, its jump engine and its table) is in the record and is not measured here.",
    },
    status: {
      split_line: "The picture line the scroll is set at while it draws",
      split_frames: "Frames it was set there",
      frames: "Frames measured",
      bar_scroll: "The scroll set in the blank, for the bar: across, down",
      "timer-row": "The timer: its row in the bar",
      "timer-column": "The timer: its column",
      "timer-tiles": "The timer: tiles a write",
      "timer-writes": "The timer: times written",
      "timer-every": "The timer: frames between writes",
      other_bar_writes: "Other writes into the bar",
    },
    sound: {
      music_before: "Writes to the square channels in the second before the jump: the music",
      starts: "Frames from the press to the jump sound's first setting with the sweep on",
      sweep_settings: "Settings with the pitch sweep on, in the second after the press",
      sweep_frames: "Frames of the jump sound those settings land on",
      music_back: "Frames until the music writes to the channel again",
    },
    pause: {
      ignored_after: "Presses of Start that were ignored: frames after the pause",
      a_pressed: "A was pressed while paused",
      stops: "Frames from the pause to the square holding still",
      starts: "Frames from the unpause to the square moving again",
      held: "The square held still the whole pause",
      wait: "Frames Start is ignored after a press",
      drawn: "Writes to the picture while paused",
      same_picture: "Two pictures taken while paused are the same, byte for byte",
      cut: "The sound was cut on the press",
      chime_notes: "Notes of the chime",
      chime_every: "Frames between the chime's notes",
      music_back: "Frames from the unpause to the music's first write",
      yes: "yes",
      no: "no",
    },
    noValue: "none",
    notMeasured: (why: string) => `It could not be measured: ${why}.`,
  },
  ja: {
    h: "プログラム",
    pick: "レッスンのプログラム",
    none: "レッスンを選ぶと、そのプログラムがここで開く。",
    opening: "開いている...",
    edit: "プログラム。自由に変えてよい:",
    assemble: "組み立てて遊ぶ",
    building: "組み立てている...",
    ours: "私たちのものに戻す",
    save: "このプログラムをダウンロード",
    built: (n: string, bytes: string) => <>組み立てられた: <b>{bytes}</b> バイトの命令 <b>{n}</b> 個。いまコンソールに入っている。</>,
    same: "レッスンのカートリッジと一バイトも違わない。",
    yours: "あなたのカートリッジだ: レッスンのものとは違う。",
    lesson: "レッスンのページ",
    measuredH: "レッスンと同じやり方で測った",
    measuring: "レッスンと同じボタン操作で測っている...",
    measured: "あなたのカートリッジを、誰も見ていないところでレッスンと同じボタン操作にかけ、私たちのものと同じ読み方で読んだ。",
    what: "何を",
    oursCol: "私たちの",
    yoursCol: "あなたの",
    fullAfter: "全速になるまでに歩いたフレーム数",
    full: "全速、一フレームあたりのピクセル",
    jumpFrames: (held: string) => `A を ${held} フレーム押す: 空中にいたフレーム数`,
    jumpRisen: (held: string) => `A を ${held} フレーム押す: 上がったピクセル`,
    run: {
      walk_top: "歩く最高速、一フレームあたりのピクセル",
      run_top: "走る最高速、一フレームあたりのピクセル",
      run_after: "B を押してそこに達するまでのフレーム数",
      "walk-first": "歩いてのジャンプ: 最初の上向きの速さ、一フレームあたりのピクセル",
      "walk-held": "歩いてのジャンプ: A を押している間の引き、256 分の 1 単位",
      "walk-released": "歩いてのジャンプ: その後の引き、256 分の 1 単位",
      "walk-rose": "歩いてのジャンプ: 上がったピクセル",
      "run-first": "走ってのジャンプ: 最初の上向きの速さ、一フレームあたりのピクセル",
      "run-held": "走ってのジャンプ: A を押している間の引き、256 分の 1 単位",
      "run-released": "走ってのジャンプ: その後の引き、256 分の 1 単位",
      "run-rose": "走ってのジャンプ: 上がったピクセル",
      light_max: "弱いジャンプになる最も速い速さ、16 分の 1 単位",
      strong_min: "強いジャンプになる最も遅い速さ、16 分の 1 単位",
    },
    stomp: {
      walk: "歩くものの速さ、一フレームあたりのピクセル",
      "stomp-frame": "踏みつけ: そのフレーム",
      "stomp-dx": "踏みつけ: 前のフレームの横のずれ、ピクセル",
      "stomp-dy": "踏みつけ: 前のフレームの縦のずれ、ピクセル",
      "stomp-fall": "踏みつけ: 四角の下向きの速さ、前、一フレームあたりのピクセル",
      "stomp-after": "踏みつけ: 四角の下向きの速さ、後",
      "stomp-state": "踏みつけ: 歩くものの状態、後",
      "stomp-flat": "歩くものが潰れている間のフレーム数",
      "hit-frame": "ぶつかり: そのフレーム",
      "hit-dx": "ぶつかり: 前のフレームの横のずれ、ピクセル",
      "hit-dy": "ぶつかり: 前のフレームの縦のずれ、ピクセル",
      "hit-fall": "ぶつかり: 四角の下向きの速さ、前、一フレームあたりのピクセル",
      "hit-after": "ぶつかり: 四角の下向きの速さ、後",
      "hit-state": "ぶつかり: 歩くものの状態、後",
      notTaken: "私たちの解剖がこのプログラムの接触ルーチンについて言うことは記録にあり、ここでは測らない。",
    },
    walkers: {
      pixels: "一歩のピクセル",
      every: "歩と歩のあいだのフレーム数",
      wall_turns: "壁で向きを変えた回数",
      inside: "壁で、一フレーム壁の中に一ピクセル入ったか",
      meetings: "出会い、同じフレームで両方が向きを変えた回数",
      overlap: "出会いで二つが重なったピクセル",
      yes: "はい",
      no: "いいえ",
    },
    camera: {
      starts_at: "右へ歩く: カメラが初めて動いたときの四角の画面上の位置、ピクセル",
      holds_at: "右へ歩く: カメラが四角を留めておく位置",
      eased: "カメラが四角より少なく右へ動いたフレーム数",
      back: "左へ歩く: カメラが戻ることがあるか",
      back_at: "左へ歩く: カメラが四角を留めておく位置",
      restarts_at: "また右へ: カメラが次に動いたときの四角の位置",
      yes: "はい",
      no: "いいえ",
    },
    platforms: {
      axis: "リフトの動く向き",
      across: "横",
      down: "上下",
      step: "リフトの一歩、ピクセル",
      every: "リフトの歩と歩のあいだのフレーム数",
      travel: "リフトの行程、ピクセル",
      standing: "四角がリフトの上に立っていたフレーム数",
      stepped: "そのうち、その向きに一秒間何も押さずにリフトが一歩動いたフレーム数",
      same: "そのうち、四角がリフトの一歩と同じだけ動いたフレーム数",
      steady: "リフトの上での四角の高さが一定だったか",
      yes: "はい",
      no: "いいえ",
    },
    scroll: {
      strips: "カメラが動く間に組み立てた土地の帯の数",
      every_min: "帯と次の帯のあいだのピクセル: 最小",
      every_max: "帯と次の帯のあいだのピクセル: 最大",
      every_mean: "帯と次の帯のあいだのピクセル: 平均",
      frames: "一つの帯にかかるフレーム数",
      columns: "一つの帯で書く列の数",
      tiles: "一列のタイル数",
      colours: "一つの帯での色の書き込み数",
      ahead_min: "最初の列が画面右端より先に置かれるピクセル: 最小",
      ahead_max: "最初の列が画面右端より先に置かれるピクセル: 最大",
      column_frames: "帯の何フレーム目に列を書くか",
      last_write: "帯の最後の書き込みのフレーム",
    },
    rooms: {
      mirroring: "どのネームテーブルが隣り合うか",
      fixed: "基板で固定",
      before: "横に出る: 前の部屋の番号",
      after: "横に出る: 後の部屋の番号",
      wait: "番号が変わってから絵が動くまでのフレーム数",
      slide: "絵が滑ったフレーム数",
      travel: "絵が滑ったピクセル",
      step: "一フレームあたりのピクセル、いつもの一歩",
      written_before: "滑る前に書いた 8 タイル以上の並び: タイル数と向き、回数",
      written_during: "滑る間に書いた 8 タイル以上の並び: タイル数と向き、回数",
      column_every: "滑る間に書いた列と列のあいだのフレーム数",
      columns_from: "最初の列を書いた、滑りの何フレーム目か",
      columns: "滑る間に書いた列の数",
      "up-before": "上に出る: 前の部屋の番号",
      "up-after": "上に出る: 後の部屋の番号",
      "up-rows": "番号が変わってから横に書いた行の数",
      "up-tiles": "一行のタイル数",
      "up-first": "番号が変わってから最初の行までのフレーム数",
      "up-every": "行と行のあいだのフレーム数",
      "up-upward": "行はテーブルを上へ進むか",
      "up-from_row": "最初に書いた行",
      "up-to_row": "最後に書いた行",
      yes: "はい",
      no: "いいえ",
    },
    screens: {
      values: "画面のバイトが取った値、順に",
      changes: "変わった回数",
      "pause-before": "遊んでいる間に一フレームで変わるメモリのセル数、中央値",
      "pause-during": "一時停止の間に一フレームで変わるメモリのセル数、中央値",
      "pause-frames": "一時停止していたフレーム数",
      notTaken: "私たちの解剖がこのプログラムについて言うこと (区切り、ジャンプエンジン、表) は記録にあり、ここでは測らない。",
    },
    status: {
      split_line: "描いている間にスクロールを設定する絵の行",
      split_frames: "そこで設定したフレーム数",
      frames: "測ったフレーム数",
      bar_scroll: "ブランクでバーのために設定したスクロール: 横、縦",
      "timer-row": "タイマー: バーの中の行",
      "timer-column": "タイマー: 列",
      "timer-tiles": "タイマー: 一回の書き込みのタイル数",
      "timer-writes": "タイマー: 書いた回数",
      "timer-every": "タイマー: 書き込みのあいだのフレーム数",
      other_bar_writes: "バーへのその他の書き込み",
    },
    sound: {
      music_before: "ジャンプ前の一秒間の矩形波チャンネルへの書き込み: 音楽",
      starts: "押してからジャンプ音の最初のスイープつき設定までのフレーム数",
      sweep_settings: "押してからの一秒間の、ピッチスイープつきの設定の数",
      sweep_frames: "それらの設定がジャンプ音の何フレーム目に当たるか",
      music_back: "音楽がそのチャンネルにまた書くまでのフレーム数",
    },
    pause: {
      ignored_after: "無視されたStartの押下: ポーズからのフレーム数",
      a_pressed: "ポーズ中にAが押された",
      stops: "ポーズから四角が止まるまでのフレーム数",
      starts: "ポーズ解除から四角がまた動くまでのフレーム数",
      held: "四角はポーズの間ずっと止まっていた",
      wait: "押してからStartが無視されるフレーム数",
      drawn: "ポーズ中の絵への書き込み",
      same_picture: "ポーズ中に撮った二枚の絵はバイト単位で同じ",
      cut: "押した瞬間に音が切られた",
      chime_notes: "チャイムの音の数",
      chime_every: "チャイムの音の間のフレーム数",
      music_back: "ポーズ解除から音楽の最初の書き込みまでのフレーム数",
      yes: "はい",
      no: "いいえ",
    },
    noValue: "なし",
    notMeasured: (why: string) => `測れなかった: ${why}。`,
  },
} as const;

/** A row's value is a number, or for a measure the record keeps as a list (the walkers' insides and overlaps) the list's items joined by a space; null is none. */
type Row = { key: string; label: string; ours: number | string | null; yours: number | string | null; oursText: string; yoursText: string };
type Measure = NonNullable<program.Parts["measure"]>;

/** Our numbers and the reader's, a row a number. A jump of theirs that ours has no match for is not listed. */
function rows(T: (typeof S)[Lang], measure: Measure, theirs: program.Yours, n: (v: number) => string): Row[] {
  const text = (v: number | null) => (v === null ? T.noValue : n(v));
  const row = (key: string, label: string, a: number | null, b: number | null): Row => ({ key, label, ours: a, yours: b, oursText: text(a), yoursText: text(b) });
  if (measure.plan.kind === "run") {
    const ours = measure.ours as RunMeasures, yours = theirs as RunMeasures;
    const jump = (k: "walk" | "run", a: RunMeasures["walk_jump"], b: RunMeasures["walk_jump"]) => [
      // The record keeps a speed upward as a negative; the page says "up".
      row(`${k}-first`, T.run[`${k}-first`], -a.first, -b.first),
      row(`${k}-held`, T.run[`${k}-held`], a.held, b.held),
      row(`${k}-released`, T.run[`${k}-released`], a.released, b.released),
      row(`${k}-rose`, T.run[`${k}-rose`], a.rose, b.rose),
    ];
    return [
      row("walk_top", T.run.walk_top, ours.walk_top, yours.walk_top),
      row("run_top", T.run.run_top, ours.run_top, yours.run_top),
      row("run_after", T.run.run_after, ours.run_after, yours.run_after),
      ...jump("walk", ours.walk_jump, yours.walk_jump),
      ...jump("run", ours.run_jump, yours.run_jump),
      row("light_max", T.run.light_max, ours.light_max, yours.light_max),
      row("strong_min", T.run.strong_min, ours.strong_min, yours.strong_min),
    ];
  }
  if (measure.plan.kind === "walkers") {
    const ours = measure.ours as WalkersMeasures, yours = theirs as WalkersMeasures;
    // A list is one row: its items joined, in the record's order, so a list of one reads as the one.
    const list = (key: string, label: string, a: (number | string)[], b: (number | string)[], text: (v: number | string) => string): Row => {
      const value = (v: (number | string)[]) => (v.length ? v.join(" ") : null);
      const shown = (v: (number | string)[]) => (v.length ? v.map(text).join(", ") : T.noValue);
      return { key, label, ours: value(a), yours: value(b), oursText: shown(a), yoursText: shown(b) };
    };
    const yn = (v: boolean[]) => v.map((b) => (b ? 1 : 0));
    return [
      row("pixels", T.walkers.pixels, ours.pixels, yours.pixels),
      row("every", T.walkers.every, ours.every, yours.every),
      row("wall_turns", T.walkers.wall_turns, ours.wall_turns, yours.wall_turns),
      list("inside", T.walkers.inside, yn(ours.inside), yn(yours.inside), (v) => (v ? T.walkers.yes : T.walkers.no)),
      row("meetings", T.walkers.meetings, ours.meetings, yours.meetings),
      list("overlap", T.walkers.overlap, ours.overlap, yours.overlap, (v) => n(Number(v))),
    ];
  }
  if (measure.plan.kind === "camera") {
    const ours = measure.ours as CameraMeasures, yours = theirs as CameraMeasures;
    const yn = (b: boolean): Row => ({ key: "back", label: T.camera.back, ours: Number(ours.back), yours: Number(b), oursText: ours.back ? T.camera.yes : T.camera.no, yoursText: b ? T.camera.yes : T.camera.no });
    return [
      row("starts_at", T.camera.starts_at, ours.starts_at, yours.starts_at),
      row("holds_at", T.camera.holds_at, ours.holds_at, yours.holds_at),
      row("eased", T.camera.eased, ours.eased, yours.eased),
      yn(yours.back),
      row("back_at", T.camera.back_at, ours.back_at, yours.back_at),
      row("restarts_at", T.camera.restarts_at, ours.restarts_at, yours.restarts_at),
    ];
  }
  if (measure.plan.kind === "platforms") {
    const ours = measure.ours as PlatformsMeasures, yours = theirs as PlatformsMeasures;
    const P = T.platforms;
    const word = (key: "axis" | "steady", a: string | number, b: string | number, text: (v: string | number) => string): Row => ({ key, label: P[key], ours: a, yours: b, oursText: text(a), yoursText: text(b) });
    return [
      word("axis", ours.axis, yours.axis, (v) => (v === "across" ? P.across : P.down)),
      row("step", P.step, ours.step, yours.step),
      row("every", P.every, ours.every, yours.every),
      row("travel", P.travel, ours.travel, yours.travel),
      row("standing", P.standing, ours.standing, yours.standing),
      row("stepped", P.stepped, ours.stepped, yours.stepped),
      row("same", P.same, ours.same, yours.same),
      word("steady", Number(ours.steady), Number(yours.steady), (v) => (v ? P.yes : P.no)),
    ];
  }
  if (measure.plan.kind === "scroll") {
    const ours = measure.ours as ScrollMeasures, yours = theirs as ScrollMeasures;
    const S = T.scroll;
    // A measure the record keeps as a list of the values seen is one row: the values joined, in the record's order.
    const list = (key: keyof ScrollMeasures & keyof typeof S, a: (string | number)[], b: (string | number)[]): Row => {
      const value = (v: (string | number)[]) => (v.length ? v.join(" ") : null);
      const shown = (v: (string | number)[]) => (v.length ? v.join(", ") : T.noValue);
      return { key, label: S[key], ours: value(a), yours: value(b), oursText: shown(a), yoursText: shown(b) };
    };
    return [
      row("strips", S.strips, ours.strips, yours.strips),
      row("every_min", S.every_min, ours.every_min, yours.every_min),
      row("every_max", S.every_max, ours.every_max, yours.every_max),
      row("every_mean", S.every_mean, ours.every_mean, yours.every_mean),
      list("frames", ours.frames, yours.frames),
      list("columns", ours.columns, yours.columns),
      list("tiles", ours.tiles, yours.tiles),
      list("colours", ours.colours, yours.colours),
      row("ahead_min", S.ahead_min, ours.ahead_min, yours.ahead_min),
      row("ahead_max", S.ahead_max, ours.ahead_max, yours.ahead_max),
      list("column_frames", ours.column_frames, yours.column_frames),
      list("last_write", ours.last_write, yours.last_write),
    ];
  }
  if (measure.plan.kind === "rooms") {
    const ours = measure.ours as RoomsMeasures, yours = theirs as RoomsMeasures;
    const R = T.rooms;
    type Key = keyof typeof R;
    const list = (key: Key, a: (string | number)[], b: (string | number)[]): Row => ({
      key, label: R[key], ours: a.length ? a.join(" ") : null, yours: b.length ? b.join(" ") : null, oursText: a.length ? a.join(", ") : T.noValue, yoursText: b.length ? b.join(", ") : T.noValue,
    });
    // Runs written, "<tiles> <way>: how many" each, in the record's order.
    const runs = (key: Key, a: Record<string, number>, b: Record<string, number>): Row => {
      const value = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} ${v}`);
      const shown = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k}: ${n(v)}`);
      return { key, label: R[key], ours: value(a).join("; ") || null, yours: value(b).join("; ") || null, oursText: shown(a).join("; ") || T.noValue, yoursText: shown(b).join("; ") || T.noValue };
    };
    const word = (key: Key, a: string | number, b: string | number, text: (v: string | number) => string): Row => ({ key, label: R[key], ours: a, yours: b, oursText: text(a), yoursText: text(b) });
    const mirror = (m: RoomsMeasures["mirroring"]) => (m ? `${m.playing}${m.fixed ? " fixed" : ""}` : "");
    const upRows: Row[] = ours.up && yours.up ? [
      row("up-before", R["up-before"], ours.up.before, yours.up.before),
      row("up-after", R["up-after"], ours.up.after, yours.up.after),
      row("up-rows", R["up-rows"], ours.up.rows, yours.up.rows),
      list("up-tiles", ours.up.tiles, yours.up.tiles),
      row("up-first", R["up-first"], ours.up.first, yours.up.first),
      list("up-every", ours.up.every, yours.up.every),
      word("up-upward", Number(ours.up.upward), Number(yours.up.upward), (v) => (v ? R.yes : R.no)),
      row("up-from_row", R["up-from_row"], ours.up.from_row, yours.up.from_row),
      row("up-to_row", R["up-to_row"], ours.up.to_row, yours.up.to_row),
    ] : [];
    return [
      word("mirroring", mirror(ours.mirroring), mirror(yours.mirroring), (v) => String(v).replace(" fixed", `, ${R.fixed}`)),
      row("before", R.before, ours.before, yours.before),
      row("after", R.after, ours.after, yours.after),
      row("wait", R.wait, ours.wait, yours.wait),
      row("slide", R.slide, ours.slide, yours.slide),
      row("travel", R.travel, ours.travel, yours.travel),
      row("step", R.step, ours.step, yours.step),
      runs("written_before", ours.written_before, yours.written_before),
      runs("written_during", ours.written_during, yours.written_during),
      list("column_every", ours.column_every, yours.column_every),
      row("columns_from", R.columns_from, ours.columns_from, yours.columns_from),
      row("columns", R.columns, ours.columns, yours.columns),
      ...upRows,
    ];
  }
  if (measure.plan.kind === "screens") {
    const ours = measure.ours as ScreensMeasures, yours = theirs as ScreensMeasures;
    const C = T.screens;
    return [
      { key: "values", label: C.values, ours: ours.values.join(" "), yours: yours.values.join(" "), oursText: ours.values.join(", "), yoursText: yours.values.join(", ") },
      row("changes", C.changes, ours.changes, yours.changes),
      row("pause-before", C["pause-before"], ours.pause?.before ?? null, yours.pause?.before ?? null),
      row("pause-during", C["pause-during"], ours.pause?.during ?? null, yours.pause?.during ?? null),
      row("pause-frames", C["pause-frames"], ours.pause?.frames ?? null, yours.pause?.frames ?? null),
    ];
  }
  if (measure.plan.kind === "status") {
    const ours = measure.ours as StatusMeasures, yours = theirs as StatusMeasures;
    const B = T.status;
    const list = (key: keyof typeof B, a: number[], b: number[]): Row => ({
      key, label: B[key], ours: a.length ? a.join(" ") : null, yours: b.length ? b.join(" ") : null, oursText: a.length ? a.join(", ") : T.noValue, yoursText: b.length ? b.join(", ") : T.noValue,
    });
    return [
      row("split_line", B.split_line, ours.split_line, yours.split_line),
      row("split_frames", B.split_frames, ours.split_frames, yours.split_frames),
      row("frames", B.frames, ours.frames, yours.frames),
      list("bar_scroll", ours.bar_scroll, yours.bar_scroll),
      row("timer-row", B["timer-row"], ours.timer.row, yours.timer.row),
      row("timer-column", B["timer-column"], ours.timer.column, yours.timer.column),
      row("timer-tiles", B["timer-tiles"], ours.timer.tiles, yours.timer.tiles),
      row("timer-writes", B["timer-writes"], ours.timer.writes, yours.timer.writes),
      list("timer-every", ours.timer.every, yours.timer.every),
      row("other_bar_writes", B.other_bar_writes, ours.other_bar_writes, yours.other_bar_writes),
    ];
  }
  if (measure.plan.kind === "sound") {
    const ours = measure.ours as SoundMeasures, yours = theirs as SoundMeasures;
    const D = T.sound;
    const frames = (v?: number[]) => (v && v.length ? v.join(" ") : null);
    return [
      row("music_before", D.music_before, ours.music_before, yours.music_before),
      row("starts", D.starts, ours.starts ?? null, yours.starts ?? null),
      row("sweep_settings", D.sweep_settings, ours.sweep_settings, yours.sweep_settings),
      { key: "sweep_frames", label: D.sweep_frames, ours: frames(ours.sweep_frames), yours: frames(yours.sweep_frames), oursText: ours.sweep_frames?.join(", ") || T.noValue, yoursText: yours.sweep_frames?.join(", ") || T.noValue },
      row("music_back", D.music_back, ours.music_back ?? null, yours.music_back ?? null),
    ];
  }
  if (measure.plan.kind === "pause") {
    const ours = measure.ours as PauseMeasures, yours = theirs as PauseMeasures;
    const P = T.pause;
    const list = (key: "ignored_after" | "chime_every", a: number[], b: number[]): Row => ({
      key, label: P[key], ours: a.length ? a.join(" ") : null, yours: b.length ? b.join(" ") : null, oursText: a.length ? a.join(", ") : T.noValue, yoursText: b.length ? b.join(", ") : T.noValue,
    });
    const yn = (key: "a_pressed" | "held" | "same_picture" | "cut", a: boolean, b: boolean): Row => ({ key, label: P[key], ours: Number(a), yours: Number(b), oursText: a ? P.yes : P.no, yoursText: b ? P.yes : P.no });
    return [
      list("ignored_after", ours.ignored_after, yours.ignored_after),
      yn("a_pressed", ours.a_pressed, yours.a_pressed),
      row("stops", P.stops, ours.stops, yours.stops),
      row("starts", P.starts, ours.starts, yours.starts),
      yn("held", ours.held, yours.held),
      row("wait", P.wait, ours.wait, yours.wait),
      row("drawn", P.drawn, ours.drawn, yours.drawn),
      yn("same_picture", ours.same_picture, yours.same_picture),
      yn("cut", ours.cut, yours.cut),
      row("chime_notes", P.chime_notes, ours.chime_notes, yours.chime_notes),
      list("chime_every", ours.chime_every, yours.chime_every),
      row("music_back", P.music_back, ours.music_back, yours.music_back),
    ];
  }
  if (measure.plan.kind === "stomp") {
    const ours = measure.ours as StompMeasures, yours = theirs as StompMeasures;
    const touch = (k: "stomp" | "hit", a: StompMeasures["hit"], b: StompMeasures["hit"]) => [
      row(`${k}-frame`, T.stomp[`${k}-frame`], a.frame, b.frame),
      row(`${k}-dx`, T.stomp[`${k}-dx`], a.dx, b.dx),
      row(`${k}-dy`, T.stomp[`${k}-dy`], a.dy, b.dy),
      row(`${k}-fall`, T.stomp[`${k}-fall`], a.fall, b.fall),
      row(`${k}-after`, T.stomp[`${k}-after`], a.after, b.after),
      row(`${k}-state`, T.stomp[`${k}-state`], a.state[1], b.state[1]),
    ];
    return [
      row("walk", T.stomp.walk, ours.walk, yours.walk),
      ...touch("stomp", ours.stomp, yours.stomp),
      row("stomp-flat", T.stomp["stomp-flat"], ours.stomp.flat, yours.stomp.flat),
      ...touch("hit", ours.hit, yours.hit),
    ];
  }
  const ours = measure.ours as JumpMeasures, yours = theirs as JumpMeasures;
  return [
    row("full_speed_after", T.fullAfter, ours.full_speed_after, yours.full_speed_after),
    row("full_speed", T.full, ours.full_speed, yours.full_speed),
    ...ours.jumps.flatMap((j, k) =>
      yours.jumps[k]
        ? [row(`frames-${j.held}`, T.jumpFrames(n(j.held)), j.frames, yours.jumps[k].frames), row(`risen-${j.held}`, T.jumpRisen(n(j.held)), j.risen, yours.jumps[k].risen)]
        : [],
    ),
  ];
}

export function Program({ lang, lessons }: { lang: Lang; lessons: { key: string; title: string }[] }) {
  const T = S[lang];
  const p = useSyncExternalStore(program.subscribe, program.snapshot, program.serverSnapshot);
  // ?lesson=<name> opens that lesson's program here, the way the cartridge
  // window loads its cartridge; the desk brings this window forward when it
  // has (Create.tsx).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const name = new URLSearchParams(window.location.search).get("lesson");
    if (name && lessons.some((l) => l.key === name)) void program.open(name);
  }, [lessons]);
  const n = (v: number) => v.toLocaleString(lang);
  const key = p.parts?.key ?? "";
  return (
    <section className="wb-page play-section" id="program" data-program data-program-for={key}>
      <h2 className="eyebrow">{T.h}</h2>
      <p className="quiet">
        <label>
          {T.pick}{" "}
          {/* A select is as wide as its longest title unless held to the window. */}
          <select value={key} onChange={(e) => void program.open(e.target.value)} style={{ maxWidth: "100%" }} data-program-pick>
            <option value="" disabled>
              ...
            </option>
            {lessons.map((l) => (
              <option key={l.key} value={l.key}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        {key ? (
          <>
            {" "}
            <a href={`${lang === "ja" ? "/ja" : ""}/autopsy/lessons/${key}`}>{T.lesson}</a>
          </>
        ) : null}
      </p>
      {!p.parts ? (
        <p className="quiet" data-program-none>{p.busy ? T.opening : T.none}</p>
      ) : (
        <>
          <p className="quiet">{T.edit}</p>
          <textarea
            className="readout program-text"
            value={p.text}
            onChange={(e) => program.edit(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            rows={24}
            style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre", overflow: "auto" }}
            aria-label={T.edit}
            data-program-text
          />
          <p className="quiet">
            <button type="button" className="btn btn-primary" disabled={p.busy} onClick={() => void program.assemble()} data-program-assemble>
              {p.busy ? T.building : T.assemble}
            </button>{" "}
            <button type="button" className="btn" disabled={p.busy || (p.text === p.parts.prg && p.chr === p.parts.chr)} onClick={() => program.ours()} data-program-ours>
              {T.ours}
            </button>{" "}
            <button type="button" className="btn btn-ghost" onClick={() => program.download()} data-program-download>
              {T.save}
            </button>
          </p>
          {p.why ? (
            <p className="notice fail" data-program-why>
              {p.why}
            </p>
          ) : null}
          {p.built ? (
            <p data-program-built data-program-sha={p.built.sha256} data-program-same={String(p.built.sha256 === p.parts.sha256)}>
              {T.built(n(p.built.instructions), n(p.built.code_bytes))} {p.built.sha256 === p.parts.sha256 ? T.same : T.yours}
            </p>
          ) : null}
          {p.built && p.parts.measure ? (
            <div data-program-measured={p.measured ? (p.measured.yours ? "yes" : "no") : "wait"}>
              <h3 className="eyebrow">{T.measuredH}</h3>
              {!p.measured ? (
                <p className="quiet">{T.measuring}</p>
              ) : p.measured.yours === null ? (
                <p className="notice fail" data-program-measure-why>{T.notMeasured(p.measured.why)}</p>
              ) : (
                <>
                  <p className="quiet">{T.measured}</p>
                  <div className="ledger">
                    <div className="scroller">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{T.what}</th>
                          <th scope="col">{T.oursCol}</th>
                          <th scope="col">{T.yoursCol}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows(T, p.parts.measure, p.measured.yours, n).map((r) => (
                          <tr key={r.key} data-program-measure={r.key} data-ours={r.ours ?? ""} data-yours={r.yours ?? ""} data-same={String(r.ours === r.yours)}>
                            <th scope="row">{r.label}</th>
                            <td>{r.oursText}</td>
                            <td>{r.ours === r.yours ? r.yoursText : <b>{r.yoursText}</b>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                  {p.parts.measure.plan.kind === "stomp" || p.parts.measure.plan.kind === "screens" ? (
                    <p className="quiet" data-program-not-taken>{T[p.parts.measure.plan.kind].notTaken}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
