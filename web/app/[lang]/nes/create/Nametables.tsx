"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { parseInes } from "@/lib/ines";
import { nametables, serverSnapshot, snapshot, subscribe } from "../play/playEngine";
// The CHR decoder the sprite sheet uses, so a tile is read one way on the desk.
import { decodeCHR, TILE } from "../../../../public/6502/games/chr.js";

/**
 * The Nametables window: the picture chip's own 2 KiB of nametable RAM,
 * drawn as the two tables the chip holds (docs/nes/workbench.md: the
 * console worker's `ciram` path had no caller until 2026-09-29). Each
 * table is 32 by 30 tile numbers and 64 attribute bytes; the tiles are
 * drawn from the pattern table the PPU's control register names for the
 * background, in the four background palettes as palette RAM holds them,
 * in the colours the picture worker measured.
 *
 * What is shown is what the chip holds, in the chip's order, because that
 * is what the console answers. How the four PPU nametable addresses land
 * on these two tables is the board's mirroring: the header says it for a
 * board whose mirroring is soldered, and a board that switches it says
 * nothing this window can read, so the labels say which case they are in.
 * A board that banks its picture ROM is the one refusal here: the console
 * does not yet say which bank the PPU sees, so the tile numbers are read
 * and the tiles are not drawn, and the window says so rather than drawing
 * the file's first bank as if it were on the bus.
 *
 * The tables are asked of the worker on demand, each time the machine's
 * panels are published while this window is on view, not sent with every
 * tick: the window is usually closed.
 */

const S = {
  en: {
    h: "Nametables",
    none: "No cartridge: nothing to read.",
    off: "Power is off: nothing to read.",
    noReads: "This bundle has no reads; the tables wait on the boarded console.",
    waiting: "waiting for the console's nametable RAM",
    what: (pat: number, filled: number) => <>the two tables the picture chip holds, drawn with the background tiles from pattern table <b>${pat.toString(16).toUpperCase().padStart(4, "0")}</b>; {filled} of 1920 tile numbers are not zero</>,
    tableA: "CIRAM $000 to $3FF",
    tableB: "CIRAM $400 to $7FF",
    lands: (a: string, b: string) => `PPU ${a} and ${b}`,
    horizontal: "The header says horizontal mirroring: the left table is the PPU's $2000 and $2400 (the top screen) and the right one $2800 and $2C00 (the bottom).",
    vertical: "The header says vertical mirroring: the left table is the PPU's $2000 and $2800 (the left screen) and the right one $2400 and $2C00 (the right).",
    switched: "This board switches its mirroring as the game runs, so which PPU addresses land on which table is the game's to say; the tables are shown as the chip holds them.",
    four: "The header says four-screen: the board carries two more tables of its own, which the chip's RAM does not hold.",
    banked: (kib: number) => `This board banks its ${kib} KiB of picture ROM and the console does not yet say which bank the picture chip sees, so the tile numbers are read and the tiles are not drawn.`,
    ram: "The tiles are the console's CHR-RAM, as the game has drawn them.",
    hover: (table: string, col: number, row: number, tile: number, pal: number, at: number) => <>{table}, column {col}, row {row}: tile <b>${tile.toString(16).toUpperCase().padStart(2, "0")}</b>, palette {pal}, at CIRAM <b>${at.toString(16).toUpperCase().padStart(3, "0")}</b></>,
    hoverNone: "Point at a tile to read its number and palette.",
  },
  ja: {
    h: "ネームテーブル",
    none: "カートリッジが無い: 読むものが無い。",
    off: "電源が切れている: 読むものが無い。",
    noReads: "このバンドルには読み出しが無い。テーブルは搭載されたコンソールを待っている。",
    waiting: "コンソールのネームテーブル RAM を待っている",
    what: (pat: number, filled: number) => <>画像チップが持つ二つのテーブル。背景タイルはパターンテーブル <b>${pat.toString(16).toUpperCase().padStart(4, "0")}</b> から描いた。1920 のタイル番号のうち {filled} が 0 でない</>,
    tableA: "CIRAM $000 から $3FF",
    tableB: "CIRAM $400 から $7FF",
    lands: (a: string, b: string) => `PPU ${a} と ${b}`,
    horizontal: "ヘッダは水平ミラーリングと言っている: 左のテーブルが PPU の $2000 と $2400（上の画面）、右が $2800 と $2C00（下の画面）。",
    vertical: "ヘッダは垂直ミラーリングと言っている: 左のテーブルが PPU の $2000 と $2800（左の画面）、右が $2400 と $2C00（右の画面）。",
    switched: "この基板はゲームの実行中にミラーリングを切り替えるので、どの PPU アドレスがどのテーブルに載るかはゲームが決める。テーブルはチップが持つままの並びで示す。",
    four: "ヘッダは四画面と言っている。基板が自前のテーブルを二つ余分に持ち、チップの RAM には無い。",
    banked: (kib: number) => `この基板は ${kib} KiB のピクチャ ROM をバンク切り替えし、コンソールはまだ画像チップがどのバンクを見ているか言わないので、タイル番号は読むがタイルは描かない。`,
    ram: "タイルはコンソールの CHR-RAM で、ゲームが描いたそのままだ。",
    hover: (table: string, col: number, row: number, tile: number, pal: number, at: number) => <>{table}、列 {col}、行 {row}: タイル <b>${tile.toString(16).toUpperCase().padStart(2, "0")}</b>、パレット {pal}、CIRAM <b>${at.toString(16).toUpperCase().padStart(3, "0")}</b></>,
    hoverNone: "タイルを指すと、その番号とパレットが読める。",
  },
} as const;

/** The worker's answer, with the image it was read from, so a new cartridge never shows the old one's tables. */
type Tables = { ciram: Uint8Array; chrRam: Uint8Array; rom: Uint8Array | null };

const COLS = 32;
const ROWS = 30;
const TABLE = 0x400;
const ATTR = 0x3c0;
const W = COLS * TILE * 2;
const H = ROWS * TILE;

/** A tile's attribute palette: two bits of the byte that covers its 4 by 4 block. */
function paletteOf(ciram: Uint8Array, table: number, col: number, row: number): number {
  const a = ciram[table * TABLE + ATTR + (row >> 2) * 8 + (col >> 2)];
  const shift = (row & 2 ? 4 : 0) + (col & 2 ? 2 : 0);
  return (a >> shift) & 3;
}

export function Nametables({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const m = s.machine;
  const why = !s.loaded ? T.none : !s.powered ? T.off : !m ? T.noReads : null;
  const [read, setRead] = useState<Tables | null>(null);
  const [shown, setShown] = useState(0);
  const box = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ table: number; col: number; row: number } | null>(null);

  // The window coming on view (opened from the tray, or the desk stacking)
  // is an ask of its own, because a paused console publishes nothing.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.getClientRects().length) setShown((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rom = s.rom;
  useEffect(() => {
    if (why) return;
    const el = box.current;
    if (!el || el.getClientRects().length === 0) return;
    let live = true;
    void nametables().then((r) => {
      if (live && r) setRead({ ...r, rom });
    });
    return () => {
      live = false;
    };
  }, [m, why, shown, rom]);
  // What is shown: the tables read from this cartridge while it is powered.
  const t = !why && read && read.rom === rom ? read : null;

  // The header's word on the board: its CHR size and its soldered mirroring.
  const board = useMemo(() => {
    if (!rom) return null;
    try {
      const h = parseInes(rom);
      const f6 = rom[6];
      return { h, four: (f6 & 8) !== 0, vertical: (f6 & 1) !== 0, soldered: h.mapper === 0 || h.mapper === 2 || h.mapper === 3 };
    } catch {
      return null;
    }
  }, [rom]);

  // Where the tiles come from: CHR-RAM as the game drew it, the file's one
  // bank when it has exactly one, or nowhere (a banked board).
  const chr = useMemo<Uint8Array | null>(() => {
    if (!t) return null;
    if (t.chrRam.length >= 8192) return t.chrRam;
    if (board && rom && board.h.chr === 8192) return rom.subarray(board.h.chrAt, board.h.chrAt + 8192);
    return null;
  }, [t, board, rom]);
  const tiles = useMemo(() => (chr ? (decodeCHR(chr) as Uint8Array[]) : null), [chr]);
  const pat = m ? (m.ppu.ctrl & 0x10 ? 0x1000 : 0) : 0;
  const filled = useMemo(() => {
    if (!t) return 0;
    let n = 0;
    for (let k = 0; k < 2; k++) for (let i = 0; i < COLS * ROWS; i++) if (t.ciram[k * TABLE + i]) n++;
    return n;
  }, [t]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !t || !m) return;
    const g = c.getContext("2d")!;
    const img = g.createImageData(W, H);
    const d = img.data;
    const measured = s.palette;
    const rgb = (code: number): [number, number, number] => {
      const v = measured?.[code & 0x3f];
      if (v) return [v[0], v[1], v[2]];
      const grey = [0x10, 0x58, 0xa8, 0xf8][(code >> 4) & 3];
      return [grey, grey, grey];
    };
    const colours: [number, number, number][] = [];
    for (let i = 0; i < 16; i++) colours.push(rgb(m.palette[i]));
    const back = colours[0];
    for (let i = 0; i < d.length; i += 4) {
      d[i] = back[0]; d[i + 1] = back[1]; d[i + 2] = back[2]; d[i + 3] = 255;
    }
    if (tiles) {
      for (let k = 0; k < 2; k++) {
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const px = tiles[(pat >> 4) + t.ciram[k * TABLE + row * COLS + col]];
            if (!px) continue;
            const pal = paletteOf(t.ciram, k, col, row);
            for (let y = 0; y < TILE; y++) {
              for (let x = 0; x < TILE; x++) {
                const v = px[y * TILE + x];
                if (v === 0) continue;
                const cc = colours[pal * 4 + v];
                const o = ((row * TILE + y) * W + k * COLS * TILE + col * TILE + x) * 4;
                d[o] = cc[0]; d[o + 1] = cc[1]; d[o + 2] = cc[2];
              }
            }
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
  }, [t, m, tiles, pat, s.palette]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return setHover(null);
    setHover({ table: x >= COLS * TILE ? 1 : 0, col: Math.floor(x / TILE) % COLS, row: Math.floor(y / TILE) });
  };

  const mirroring = !board ? null : board.four ? T.four : !board.soldered ? T.switched : board.vertical ? T.vertical : T.horizontal;
  const source = !t ? null : tiles ? (t.chrRam.length >= 8192 ? T.ram : null) : board && board.h.chr > 8192 ? T.banked(board.h.chr / 1024) : null;

  return (
    <section className="wb-page play-section nt" id="nametables" ref={box} data-nt data-nt-tiles={t ? (tiles ? "drawn" : "numbers") : undefined} data-nt-filled={t ? filled : undefined}>
      <h2 className="eyebrow">{T.h}</h2>
      {why ? (
        <p className="quiet" data-nt-why>{why}</p>
      ) : !t ? (
        <p className="quiet" data-nt-why>{T.waiting}</p>
      ) : (
        <>
          <p className="quiet">{T.what(pat, filled)}</p>
          <div className="panel"><div className="panel-face">
            <canvas ref={canvas} className="nt-canvas" width={W} height={H} onPointerMove={point} onPointerLeave={() => setHover(null)} data-nt-canvas />
          </div></div>
          <p className="nt-labels"><span>{T.tableA}</span><span>{T.tableB}</span></p>
          <p className="quiet nt-hover" data-nt-hover={hover ? `${hover.table}:${hover.col}:${hover.row}` : ""}>
            {hover
              ? T.hover(hover.table ? T.tableB : T.tableA, hover.col, hover.row, t.ciram[hover.table * TABLE + hover.row * COLS + hover.col], paletteOf(t.ciram, hover.table, hover.col, hover.row), hover.table * TABLE + hover.row * COLS + hover.col)
              : T.hoverNone}
          </p>
          {source ? <p className="quiet" data-nt-source={tiles ? "ram" : "banked"}>{source}</p> : null}
          {mirroring ? <p className="quiet" data-nt-mirroring>{mirroring}</p> : null}
        </>
      )}
    </section>
  );
}
