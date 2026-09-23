"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { applyRanges, ipsOf, parseInes, rangesOf, type Ines } from "@/lib/ines";
import { reloadWith, snapshot, serverSnapshot, subscribe } from "./playEngine";
// The console's own tile codec, the one file that says what a CHR byte is
// (ChrArt.tsx imports it the same way and says why).
import { decodeCHR, encodeCHR, TILE } from "../../../../public/6502/games/chr.js";

/**
 * Sprites from the bytes: the second step of notes/workbench.md.
 *
 * The sheet is the loaded image's CHR, decoded with the console's own
 * codec and painted with four colours the reader picks from the sixty-four
 * as the picture worker measured them (there is no colour table on this
 * site; a code is what the console puts on the wire). A board that draws
 * from CHR-RAM has no tiles in its file, and the sheet says so rather than
 * drawing nothing.
 *
 * A click opens a tile large; a brush paints it. Every edit is a change to
 * sixteen bytes of the image, kept here as the tile's new bytes against
 * the base the reader loaded, and three things can be done with the set:
 * put the patched image into the console (the engine loads it as the
 * cartridge, keeping the base as the base, so the change is seen at once
 * and survives a power cycle), take it away as an IPS patch (the reader's
 * new bytes and nothing of the base's, the one artefact of an edit to a
 * game somebody else owns that could leave this browser), or take the
 * whole patched image. Nothing here goes to the server: versions on the
 * shelf are the note's third step.
 *
 * The sprite's real colours come from palette RAM at run time, which this
 * bundle cannot read (the fourth step); until then the four the reader
 * picks are the sheet's, and the readout says so.
 */

const S = {
  en: {
    h: "Sprites",
    none: "No cartridge loaded: the sheet is its CHR.",
    ram: "This board draws from CHR-RAM, which the game fills as it runs; the file carries no tiles, and this bundle cannot read the RAM yet.",
    bad: (why: string) => `The file could not be read as an image: ${why}`,
    tiles: (n: number, tables: number) => <>tiles in the file: <b>{n}</b>, in <b>{tables}</b> pattern tables of 256</>,
    table: "Pattern table",
    tableName: (i: number) => `${i}: $${(i * 0x1000).toString(16).toUpperCase().padStart(4, "0")}`,
    picked: (i: number) => <>tile <b>${i.toString(16).toUpperCase().padStart(3, "0")}</b></>,
    pickNone: "click a tile in the sheet to open it",
    brush: "Brush",
    slots: ["background", "colour 1", "colour 2", "colour 3"],
    swatches: "The sixty-four codes, as measured",
    measured: "colours measured through the signal path",
    unmeasured: "greys until the console paints a frame; the colours are measured from the picture worker's own pipeline",
    changed: (tiles: number, bytes: number) => <>changed: <b>{tiles}</b> tiles, <b>{bytes}</b> bytes</>,
    running: (patched: boolean) => (patched ? <>the console runs <b>your patch</b></> : <>the console runs <b>the file as loaded</b></>),
    apply: "Put the patch in the console",
    revert: "Revert every edit",
    ips: "Download the patch (.ips)",
    nes: "Download the patched image (.nes)",
    revertTile: "Revert this tile",
    stays: "Nothing leaves this browser. A patch carries your new bytes and nothing of the file's; the sheet's colours are yours to choose until the console's own palette can be read.",
  },
  ja: {
    h: "スプライト",
    none: "カートリッジが読み込まれていない。シートはその CHR だ。",
    ram: "この基板は CHR-RAM から描く。ゲームが走りながら埋めるもので、ファイルにタイルは無く、このバンドルはまだその RAM を読めない。",
    bad: (why: string) => `ファイルをイメージとして読めなかった: ${why}`,
    tiles: (n: number, tables: number) => <>ファイル中のタイル: <b>{n}</b>、256 ずつ <b>{tables}</b> のパターンテーブル</>,
    table: "パターンテーブル",
    tableName: (i: number) => `${i}: $${(i * 0x1000).toString(16).toUpperCase().padStart(4, "0")}`,
    picked: (i: number) => <>タイル <b>${i.toString(16).toUpperCase().padStart(3, "0")}</b></>,
    pickNone: "シートのタイルをクリックすると開く",
    brush: "ブラシ",
    slots: ["背景", "色 1", "色 2", "色 3"],
    swatches: "64 のコード、実測のまま",
    measured: "色は信号経路を通して実測したもの",
    unmeasured: "コンソールがフレームを描くまではグレー。色は絵のワーカー自身のパイプラインで実測する",
    changed: (tiles: number, bytes: number) => <>変更: <b>{tiles}</b> タイル、<b>{bytes}</b> バイト</>,
    running: (patched: boolean) => (patched ? <>コンソールが走らせているのは<b>あなたのパッチ</b></> : <>コンソールが走らせているのは<b>読み込んだままのファイル</b></>),
    apply: "パッチをコンソールに入れる",
    revert: "すべての編集を戻す",
    ips: "パッチをダウンロード（.ips）",
    nes: "パッチ済みイメージをダウンロード（.nes）",
    revertTile: "このタイルを戻す",
    stays: "何もこのブラウザから出ない。パッチが運ぶのはあなたの新しいバイトだけで、ファイルのものは含まない。シートの色は、コンソール自身のパレットが読めるようになるまで、あなたが選ぶ。",
  },
} as const;

const SHEET_SCALE = 3;
const EDIT_SCALE = 24;
const COLS = 16;
const PER_TABLE = 256;
const DEFAULT_CODES = [0x0f, 0x00, 0x10, 0x30];

/** A colour code as CSS: measured when the worker has measured, a grey by luma row until then. */
function cssOf(code: number, palette: number[][] | null): string {
  const c = palette?.[code & 0x3f];
  if (c) return `rgb(${c[0]},${c[1]},${c[2]})`;
  return ["#101010", "#585858", "#a8a8a8", "#f8f8f8"][(code >> 4) & 3];
}

function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function Sprites({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const base = s.base;
  const header = useMemo<{ h: Ines | null; why: string | null }>(() => {
    if (!base) return { h: null, why: null };
    try {
      return { h: parseInes(base), why: null };
    } catch (e) {
      return { h: null, why: String((e as Error).message ?? e) };
    }
  }, [base]);
  const h = header.h;
  const count = h ? h.chr / 16 : 0;
  const tables = Math.ceil(count / PER_TABLE);

  // The edits, keyed by tile index in the file: the tile's sixteen bytes now.
  const [edits, setEdits] = useState<Map<number, Uint8Array>>(() => new Map());
  const [table, setTable] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [codes, setCodes] = useState<number[]>(DEFAULT_CODES);
  const [slot, setSlot] = useState(3);
  // A new cartridge is a new sheet: the edits were against the old base.
  // Adjusted during render, not in an effect (the same shape as the menu's
  // close-on-navigation), so the old edits never paint over the new sheet
  // for a frame.
  const [lastBase, setLastBase] = useState(base);
  if (lastBase !== base) {
    setLastBase(base);
    setEdits(new Map());
    setPicked(null);
    setTable(0);
  }

  const bytesOf = (tile: number): Uint8Array => {
    const e = edits.get(tile);
    if (e) return e;
    return base!.subarray(h!.chrAt + tile * 16, h!.chrAt + tile * 16 + 16);
  };

  const css = codes.map((c) => cssOf(c, s.palette));
  const sheetRef = useRef<HTMLCanvasElement>(null);
  const editRef = useRef<HTMLCanvasElement>(null);

  // The sheet: this table's tiles, each pixel a rectangle. Sixteen thousand
  // rectangles is nothing; done through an atlas it would be the same work.
  useEffect(() => {
    const c = sheetRef.current;
    if (!c || !h || count === 0) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = css[0];
    g.fillRect(0, 0, c.width, c.height);
    const first = table * PER_TABLE;
    const n = Math.min(PER_TABLE, count - first);
    for (let i = 0; i < n; i++) {
      const [px] = decodeCHR(bytesOf(first + i));
      const ox = (i % COLS) * TILE * SHEET_SCALE;
      const oy = Math.floor(i / COLS) * TILE * SHEET_SCALE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const v = px[y * TILE + x];
          if (v === 0) continue;
          g.fillStyle = css[v];
          g.fillRect(ox + x * SHEET_SCALE, oy + y * SHEET_SCALE, SHEET_SCALE, SHEET_SCALE);
        }
      }
    }
    if (picked !== null && picked >= first && picked < first + n) {
      const i = picked - first;
      g.strokeStyle = "#fff";
      g.lineWidth = 1;
      g.strokeRect((i % COLS) * TILE * SHEET_SCALE + 0.5, Math.floor(i / COLS) * TILE * SHEET_SCALE + 0.5, TILE * SHEET_SCALE - 1, TILE * SHEET_SCALE - 1);
    }
  });

  // The open tile, large.
  useEffect(() => {
    const c = editRef.current;
    if (!c || !h || picked === null) return;
    const g = c.getContext("2d")!;
    const [px] = decodeCHR(bytesOf(picked));
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        g.fillStyle = css[px[y * TILE + x]];
        g.fillRect(x * EDIT_SCALE, y * EDIT_SCALE, EDIT_SCALE, EDIT_SCALE);
      }
    }
    g.strokeStyle = "rgba(128,128,128,0.5)";
    for (let i = 1; i < TILE; i++) {
      g.beginPath(); g.moveTo(i * EDIT_SCALE + 0.5, 0); g.lineTo(i * EDIT_SCALE + 0.5, c.height); g.stroke();
      g.beginPath(); g.moveTo(0, i * EDIT_SCALE + 0.5); g.lineTo(c.width, i * EDIT_SCALE + 0.5); g.stroke();
    }
  });

  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (picked === null || !h) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * TILE);
    const y = Math.floor(((e.clientY - r.top) / r.height) * TILE);
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const [px] = decodeCHR(bytesOf(picked));
    if (px[y * TILE + x] === slot) return;
    px[y * TILE + x] = slot;
    const now = encodeCHR([px]);
    const orig = base!.subarray(h.chrAt + picked * 16, h.chrAt + picked * 16 + 16);
    setEdits((m) => {
      const next = new Map(m);
      if (same(now, orig)) next.delete(picked);
      else next.set(picked, now);
      return next;
    });
  };
  const [down, setDown] = useState(false);

  // The set as an image and as ranges: what the buttons act on.
  const working = useMemo(() => {
    if (!base || !h) return null;
    const ranges = [...edits].map(([tile, bytes]) => ({ at: h.chrAt + tile * 16, bytes }));
    return { image: applyRanges(base, ranges), ranges: rangesOf(base, applyRanges(base, ranges)) };
  }, [base, h, edits]);
  const changedBytes = working ? working.ranges.reduce((n, r) => n + r.bytes.length, 0) : 0;
  const patched = s.patched;
  const applyable = !!(working && s.rom && !same(working.image, s.rom));
  const stem = (s.loaded ?? "cartridge").replace(/\.nes$/i, "");

  return (
    <section className="wb-page play-section" id="sprites" data-spr data-spr-count={count} data-spr-changed={edits.size}>
      <h2 className="eyebrow">{T.h}</h2>
      {!base ? (
        <p className="quiet">{T.none}</p>
      ) : header.why ? (
        <p className="notice fail">{T.bad(header.why)}</p>
      ) : h && h.chr === 0 ? (
        <p className="notice" data-spr-ram>{T.ram}</p>
      ) : h ? (
        <div className="spr">
          <p className="bench-readout">
            <span className="measured">{T.tiles(count, tables)}</span>
            <span className="measured" data-spr-changed-line>{T.changed(edits.size, changedBytes)}</span>
            <span className="measured" data-spr-running={patched ? "patch" : "base"}>{T.running(patched)}</span>
          </p>
          <div className="spr-grid">
            <div className="spr-sheet">
              {tables > 1 ? (
                <label className="field">
                  <span>{T.table}</span>
                  <select className="input" value={table} onChange={(e) => setTable(Number(e.target.value))} data-spr-table>
                    {Array.from({ length: tables }, (_, i) => (
                      <option key={i} value={i}>{T.tableName(i)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="panel"><div className="panel-face">
                <canvas
                  ref={sheetRef}
                  width={COLS * TILE * SHEET_SCALE}
                  height={Math.ceil(Math.min(PER_TABLE, count - table * PER_TABLE) / COLS) * TILE * SHEET_SCALE}
                  className="spr-canvas"
                  data-spr-sheet
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = Math.floor(((e.clientX - r.left) / r.width) * COLS);
                    const y = Math.floor(((e.clientY - r.top) / r.height) * (e.currentTarget.height / (TILE * SHEET_SCALE)));
                    const i = table * PER_TABLE + y * COLS + x;
                    if (i < count) setPicked(i);
                  }}
                />
              </div></div>
            </div>
            <div className="spr-edit">
              <p className="quiet spr-picked" data-spr-picked={picked ?? ""}>{picked === null ? T.pickNone : T.picked(picked)}</p>
              <div className="panel"><div className="panel-face">
                <canvas
                  ref={editRef}
                  width={TILE * EDIT_SCALE}
                  height={TILE * EDIT_SCALE}
                  className="spr-canvas spr-tile"
                  data-spr-edit
                  onPointerDown={(e) => { setDown(true); e.currentTarget.setPointerCapture(e.pointerId); paint(e); }}
                  onPointerMove={(e) => { if (down) paint(e); }}
                  onPointerUp={() => setDown(false)}
                  onPointerCancel={() => setDown(false)}
                />
              </div></div>
              <div className="spr-brush" role="radiogroup" aria-label={T.brush}>
                {codes.map((code, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"spr-slot" + (slot === i ? " on" : "")}
                    style={{ background: css[i] }}
                    aria-pressed={slot === i}
                    title={`${T.slots[i]}: $${code.toString(16).toUpperCase().padStart(2, "0")}`}
                    onClick={() => setSlot(i)}
                    data-spr-slot={i}
                  >
                    <span>{code.toString(16).toUpperCase().padStart(2, "0")}</span>
                  </button>
                ))}
                {picked !== null && edits.has(picked) ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setEdits((m) => { const n = new Map(m); n.delete(picked); return n; })} data-spr-revert-tile>{T.revertTile}</button>
                ) : null}
              </div>
              <div className="spr-swatches" role="listbox" aria-label={T.swatches} data-spr-swatches={s.palette ? "measured" : "greys"}>
                {Array.from({ length: 64 }, (_, code) => (
                  <button
                    key={code}
                    type="button"
                    className={"spr-swatch" + (codes[slot] === code ? " on" : "")}
                    style={{ background: cssOf(code, s.palette) }}
                    title={`$${code.toString(16).toUpperCase().padStart(2, "0")}`}
                    onClick={() => setCodes((c) => c.map((v, i) => (i === slot ? code : v)))}
                    data-spr-swatch={code}
                  />
                ))}
              </div>
              <p className="quiet">{s.palette ? T.measured : T.unmeasured}</p>
            </div>
          </div>
          <div className="chips">
            <button type="button" className="btn btn-primary" disabled={!applyable} onClick={() => working && void reloadWith(working.image)} data-spr-apply>{T.apply}</button>
            <button type="button" className="btn" disabled={edits.size === 0 && !patched} onClick={() => { setEdits(new Map()); if (patched && base) void reloadWith(base); }} data-spr-revert>{T.revert}</button>
            <button type="button" className="btn" disabled={!working || working.ranges.length === 0} onClick={() => working && download(`${stem}.ips`, ipsOf(working.ranges))} data-spr-ips>{T.ips}</button>
            <button type="button" className="btn" disabled={!working || working.ranges.length === 0} onClick={() => working && download(`${stem}.patched.nes`, working.image)} data-spr-nes>{T.nes}</button>
          </div>
          <p className="quiet">{T.stays}</p>
        </div>
      ) : null}
    </section>
  );
}
