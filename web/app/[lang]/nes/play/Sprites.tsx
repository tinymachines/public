"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { applyRanges, ipsOf, parseInes, rangesOf, type Ines } from "@/lib/ines";
import { reloadWith, snapshot, serverSnapshot, subscribe } from "./playEngine";
import { addRevision, announceChange, deleteRevision, fetchRevision, listRevisions, ShelfError, type Revision } from "@/lib/shelf";
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
 * whole patched image. For a cartridge that came from the shelf there is a
 * fourth: keep the patch on the shelf as a revision, with a message (the
 * note's third step). The server applies it, measures it and refuses one
 * that changes nothing; a revision loads back into the console with its
 * edits on the sheet, and can be deleted. The image with the patch is made
 * by the server on request and checked against its digest, the way the
 * ROM is; nothing but the reader's own bytes goes up (NOTICE.md, "Somebody
 * else's game").
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
    stays: "Nothing leaves this browser unless you keep a revision on your shelf, and a revision is the patch: your new bytes and nothing of the file's. The sheet's colours are yours to choose until the console's own palette can be read.",
    keepH: "On the shelf",
    keep: "Keep this patch as a revision",
    message: "What this revision is",
    keeping: "keeping",
    kept: (n: number) => (n === 1 ? "1 revision kept" : `${n} revisions kept`),
    noRevisions: "no revisions yet",
    notShelf: "This cartridge came from your disk, so the patch has no shelf to go to. Put the cartridge on your shelf first, then load it from there.",
    rev: (r: Revision) => `${r.seq}. ${r.message || "(no message)"}: ${r.changed} bytes in ${r.ranges} ${r.ranges === 1 ? "record" : "records"}, kept ${new Date(r.created_at).toLocaleString("en")}`,
    load: "Load",
    del: "Delete",
    delSure: (r: Revision) => `Delete revision ${r.seq}? The patch goes; the cartridge stays.`,
    colours: "Sheet colours",
    mine: "the four I chose",
    bgPal: (i: number) => `the console's background palette ${i}`,
    sprPal: (i: number) => `the console's sprite palette ${i}`,
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
    stays: "棚にリビジョンとして残さない限り、何もこのブラウザから出ない。リビジョンとはパッチのことで、あなたの新しいバイトだけを運び、ファイルのものは含まない。シートの色は、コンソール自身のパレットが読めるようになるまで、あなたが選ぶ。",
    keepH: "棚に",
    keep: "このパッチをリビジョンとして残す",
    message: "このリビジョンは何か",
    keeping: "保存中",
    kept: (n: number) => `リビジョン ${n} を保持`,
    noRevisions: "リビジョンはまだない",
    notShelf: "このカートリッジはディスクから来たので、パッチの行き先の棚がない。まずカートリッジを棚に置き、そこから読み込む。",
    rev: (r: Revision) => `${r.seq}. ${r.message || "(メッセージなし)"}: ${r.ranges} レコードで ${r.changed} バイト、${new Date(r.created_at).toLocaleString("ja")} に保存`,
    load: "読み込む",
    del: "削除",
    delSure: (r: Revision) => `リビジョン ${r.seq} を削除する? パッチは消え、カートリッジは残る。`,
    colours: "シートの色",
    mine: "自分で選んだ四色",
    bgPal: (i: number) => `コンソールの背景パレット ${i}`,
    sprPal: (i: number) => `コンソールのスプライトパレット ${i}`,
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

export function Sprites({ lang, open }: { lang: Lang; open?: { tile: number; n: number } | null }) {
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
  // The sheet's four colours: the reader's own, or one of the eight the
  // PPU holds once the bundle reads palette RAM (the fourth step): the
  // sprite's real colours at last, and the readout says which.
  const [source, setSource] = useState<"mine" | number>("mine");
  const live = s.machine?.palette ?? null;
  const shown = source === "mine" || !live ? codes : [live[0], live[source * 4 + 1], live[source * 4 + 2], live[source * 4 + 3]];
  // A sprite on screen asked for its tile: open it, in its table.
  const [lastOpen, setLastOpen] = useState(0);
  if (open && open.n !== lastOpen) {
    setLastOpen(open.n);
    if (open.tile < count) {
      setPicked(open.tile);
      setTable(Math.floor(open.tile / PER_TABLE));
    }
  }
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

  const css = shown.map((c) => cssOf(c, s.palette));
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

  // The shelf's revisions of this cartridge, when it came from the shelf.
  const cart = s.cart;
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shelfWhy, setShelfWhy] = useState<string | null>(null);
  useEffect(() => {
    if (!cart) return;
    let live = true;
    void listRevisions(cart.id).then((r) => { if (live) setRevs(r.revisions); }).catch((e) => { if (live) setShelfWhy(String((e as Error).message ?? e)); });
    return () => { live = false; };
  }, [cart]);
  const shelfCall = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setShelfWhy(null);
    try {
      await fn();
    } catch (e) {
      setShelfWhy(e instanceof ShelfError ? e.message : String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };
  /** The edits a revision's image carries, tile by tile, so the sheet shows them. */
  const editsFrom = (image: Uint8Array): Map<number, Uint8Array> => {
    const m = new Map<number, Uint8Array>();
    if (!h || !base) return m;
    for (let t = 0; t < count; t++) {
      const at = h.chrAt + t * 16;
      const now = image.subarray(at, at + 16);
      if (!same(now, base.subarray(at, at + 16))) m.set(t, now.slice());
    }
    return m;
  };

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
              {live ? (
                <label className="field">
                  <span>{T.colours}</span>
                  <select className="input" value={String(source)} onChange={(e) => setSource(e.target.value === "mine" ? "mine" : Number(e.target.value))} data-spr-source>
                    <option value="mine">{T.mine}</option>
                    {[0, 1, 2, 3].map((i) => <option key={`bg${i}`} value={i}>{T.bgPal(i)}</option>)}
                    {[0, 1, 2, 3].map((i) => <option key={`sp${i}`} value={4 + i}>{T.sprPal(i)}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="spr-brush" role="radiogroup" aria-label={T.brush}>
                {shown.map((code, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"spr-slot" + (slot === i ? " on" : "")}
                    style={{ background: css[i] }}
                    aria-pressed={slot === i}
                    title={`${T.slots[i]}: $${code.toString(16).toUpperCase().padStart(2, "0")}`}
                    onClick={() => { setSlot(i); if (source !== "mine") { setCodes(shown); setSource("mine"); } }}
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

          <div className="spr-shelf" data-spr-shelf={cart ? "shelf" : "disk"}>
            <h3 className="eyebrow">{T.keepH}</h3>
            {!cart ? (
              <p className="quiet">{T.notShelf}</p>
            ) : (
              <>
                <form
                  className="chips"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!working || working.ranges.length === 0) return;
                    void shelfCall("keep", async () => {
                      const r = await addRevision(cart.id, ipsOf(working.ranges), message);
                      setRevs((rs) => [...(rs ?? []), r]);
                      setMessage("");
                      announceChange();
                    });
                  }}
                >
                  <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={T.message} maxLength={240} aria-label={T.message} data-spr-message />
                  <button type="submit" className="btn btn-primary" disabled={!working || working.ranges.length === 0 || busy !== null} data-spr-keep>{busy === "keep" ? T.keeping : T.keep}</button>
                </form>
                {shelfWhy ? <p className="notice fail" data-spr-shelf-why>{shelfWhy}</p> : null}
                <p className="quiet" data-spr-kept={revs?.length ?? 0}>{revs === null ? "" : revs.length ? T.kept(revs.length) : T.noRevisions}</p>
                {revs && revs.length ? (
                  <ul className="spr-revs">
                    {revs.map((r) => (
                      <li key={r.id} data-spr-rev={r.seq}>
                        <span>{T.rev(r)}</span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy !== null}
                          onClick={() => void shelfCall(`load ${r.id}`, async () => {
                            const file = await fetchRevision(cart, r);
                            const image = new Uint8Array(await file.arrayBuffer());
                            setEdits(editsFrom(image));
                            await reloadWith(image);
                          })}
                          data-spr-rev-load
                        >
                          {T.load}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy !== null}
                          onClick={() => { if (window.confirm(T.delSure(r))) void shelfCall(`delete ${r.id}`, async () => { await deleteRevision(cart.id, r.id); setRevs((rs) => (rs ?? []).filter((x) => x.id !== r.id)); announceChange(); }); }}
                          data-spr-rev-delete
                        >
                          {T.del}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
