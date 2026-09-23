"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { snapshot, serverSnapshot, subscribe, watch, type Machine } from "./playEngine";

/**
 * The machine as it stands, on panels: the fourth step of
 * notes/workbench.md, reads out of the engine. Every value here came out
 * of the bundle after the last frame it ran (nes-wasm's reads: no side
 * effect, no step), parsed once in playEngine and drawn here in the kit's
 * own blocks: the register file, the flags in NV-BDIZC order, the memory
 * monitor, a readout for the PPU. Nothing is typed; a bundle without the
 * reads leaves the panels saying so.
 *
 * Four sections, each a strip entry: the CPU with the PPU beside it, the
 * memory monitor following a page of the bus (the worker sends the page
 * back with every frame once told which), the palettes as the PPU holds
 * them in the measured colours, and the sprites on screen from OAM, each
 * naming its tile so the sheet can open it.
 */

const S = {
  en: {
    cpuH: "CPU",
    memH: "Memory",
    palH: "Palettes",
    oamH: "Sprites on screen",
    none: "No cartridge: nothing to read.",
    off: "Power is off: nothing to read.",
    noReads: "This bundle has no reads; the panels wait on the boarded console.",
    beam: "beam",
    at: (line: number, dot: number) => `line ${line}, dot ${dot}`,
    vbl: "vblank",
    hit: "sprite 0 hit",
    hitAt: (l: number, d: number) => `at line ${l}, dot ${d}`,
    noHit: "not this frame",
    overflow: "sprite overflow",
    yes: "yes",
    no: "no",
    fetch: (pc: number, op: number) => <>last fetch <b>${hex4(pc)}</b>, opcode <b>${hex2(op)}</b></>,
    page: "Page",
    pageHint: "a hex address; the monitor follows the 256 bytes from there, every frame",
    bg: "background",
    spr: "sprite",
    backdrop: "backdrop",
    oamNone: "no sprite is on screen: every Y in OAM is below the picture",
    oamCols: ["#", "x", "y", "tile", "palette", "flip", "behind"],
    open: "open in the sheet",
  },
  ja: {
    cpuH: "CPU",
    memH: "メモリ",
    palH: "パレット",
    oamH: "画面上のスプライト",
    none: "カートリッジが無い: 読むものが無い。",
    off: "電源が切れている: 読むものが無い。",
    noReads: "このバンドルには読み出しが無い。パネルは搭載されたコンソールを待っている。",
    beam: "ビーム",
    at: (line: number, dot: number) => `ライン ${line}、ドット ${dot}`,
    vbl: "vblank",
    hit: "スプライト 0 ヒット",
    hitAt: (l: number, d: number) => `ライン ${l}、ドット ${d}`,
    noHit: "このフレームでは無し",
    overflow: "スプライトあふれ",
    yes: "あり",
    no: "なし",
    fetch: (pc: number, op: number) => <>最後のフェッチ <b>${hex4(pc)}</b>、オペコード <b>${hex2(op)}</b></>,
    page: "ページ",
    pageHint: "16 進アドレス。モニタはそこからの 256 バイトを毎フレーム追う",
    bg: "背景",
    spr: "スプライト",
    backdrop: "背景色",
    oamNone: "画面上にスプライトは無い: OAM のどの Y も絵の下にある",
    oamCols: ["#", "x", "y", "タイル", "パレット", "反転", "後ろ"],
    open: "シートで開く",
  },
} as const;

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
const FLAGS = ["N", "V", "-", "B", "D", "I", "Z", "C"];

/** A colour code as CSS from the measured sixty-four, or a grey by luma row until they are measured. */
function cssOf(code: number, palette: number[][] | null): string {
  const c = palette?.[code & 0x3f];
  if (c) return `rgb(${c[0]},${c[1]},${c[2]})`;
  return ["#101010", "#585858", "#a8a8a8", "#f8f8f8"][(code >> 4) & 3];
}

export function State({ lang, onTile }: { lang: Lang; onTile?: (tile: number) => void }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const m = s.machine;
  const why = !s.loaded ? T.none : !s.powered ? T.off : !m ? T.noReads : null;
  const [pageText, setPageText] = useState("0000");
  // The page the monitor follows, told to the worker once it parses; the
  // bytes then arrive with every frame.
  useEffect(() => {
    if (!s.loaded || !s.powered) return;
    const at = parseInt(pageText, 16);
    if (Number.isFinite(at) && at >= 0 && at <= 0xffff) void watch(at & 0xff00, 256);
  }, [pageText, s.loaded, s.powered]);

  return (
    <>
      <section className="wb-page play-section" id="cpu" data-state="cpu">
        <h2 className="eyebrow">{T.cpuH}</h2>
        {why ? <p className="quiet" data-state-why>{why}</p> : <CpuPanel m={m!} T={T} />}
      </section>

      <section className="wb-page play-section" id="memory" data-state="memory">
        <h2 className="eyebrow">{T.memH}</h2>
        <label className="field">
          <span>{T.page}</span>
          <input className="input" value={pageText} onChange={(e) => setPageText(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 4))} title={T.pageHint} aria-label={T.page} data-mem-page />
        </label>
        {why ? <p className="quiet">{why}</p> : <Dump m={m!} />}
      </section>

      <section className="wb-page play-section" id="palettes" data-state="palettes">
        <h2 className="eyebrow">{T.palH}</h2>
        {why ? <p className="quiet">{why}</p> : <Palettes m={m!} T={T} measured={s.palette} />}
      </section>

      <section className="wb-page play-section" id="oam" data-state="oam">
        <h2 className="eyebrow">{T.oamH}</h2>
        {why ? <p className="quiet">{why}</p> : <Oam m={m!} T={T} onTile={onTile} />}
      </section>
    </>
  );
}

type Words = (typeof S)[Lang];

function CpuPanel({ m, T }: { m: Machine; T: Words }) {
  const c = m.cpu, p = m.ppu;
  return (
    <div className="panel"><div className="panel-face state-cpu">
      <div className="regs" data-cpu-regs>
        {([["A", c.a], ["X", c.x], ["Y", c.y], ["S", c.s]] as const).map(([k, v]) => (
          <div className="reg" key={k}><span>{k}</span><b data-reg={k}>${hex2(v)}</b></div>
        ))}
        <div className="reg"><span>PC</span><b data-reg="PC">${hex4(c.pc)}</b></div>
        <div className="reg"><span>P</span>
          <div className="flags" data-flags>
            {FLAGS.map((f, i) => {
              const bit = 7 - i;
              const set = (c.p >> bit) & 1;
              return <i key={f} className={(set ? "set" : "") + (f === "-" ? " unused" : "")}>{f}</i>;
            })}
          </div>
        </div>
      </div>
      <p className="state-fetch">{T.fetch(c.fetchPc, c.opcode)}</p>
      <table className="readout" data-ppu>
        <tbody>
          <tr><td>{T.beam}</td><td className="num" data-ppu-beam>{T.at(p.line, p.dot)}</td></tr>
          <tr><td>PPUCTRL</td><td className="num">${hex2(p.ctrl)}</td></tr>
          <tr><td>PPUMASK</td><td className="num">${hex2(p.mask)}</td></tr>
          <tr><td>v</td><td className="num">${hex4(p.v)}</td></tr>
          <tr><td>t</td><td className="num">${hex4(p.t)}</td></tr>
          <tr><td>fine x</td><td className="num">{p.fineX}</td></tr>
          <tr><td>w</td><td className="num">{p.w ? 1 : 0}</td></tr>
          <tr><td>OAMADDR</td><td className="num">${hex2(p.oamAddr)}</td></tr>
          <tr><td>{T.vbl}</td><td className="num">{p.vbl ? T.yes : T.no}</td></tr>
          <tr><td>{T.hit}</td><td className="num">{p.spr0Hit ? T.hitAt(p.spr0Hit.line, p.spr0Hit.dot) : T.noHit}</td></tr>
          <tr><td>{T.overflow}</td><td className="num">{p.sprOverflow ? T.yes : T.no}</td></tr>
        </tbody>
      </table>
    </div></div>
  );
}

function Dump({ m }: { m: Machine }) {
  const rows = [];
  for (let r = 0; r < m.watched.length; r += 16) {
    const bytes = Array.from(m.watched.subarray(r, r + 16));
    rows.push(
      <div className="dump-row" key={r}>
        <span className="addr">{hex4((m.watchAt + r) & 0xffff)}</span>
        <span className="bytes">{bytes.map((b, i) => <u key={i}>{hex2(b)}</u>)}</span>
        <span className="ascii">{bytes.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("")}</span>
      </div>,
    );
  }
  return <div className="panel"><div className="panel-face"><div className="dump" data-mem-dump={hex4(m.watchAt)}>{rows}</div></div></div>;
}

function Palettes({ m, T, measured }: { m: Machine; T: Words; measured: number[][] | null }) {
  const pal = m.palette;
  const groups = [0, 1, 2, 3].flatMap((i) => [{ label: `${T.bg} ${i}`, base: i * 4, kind: "bg" }, { label: `${T.spr} ${i}`, base: 16 + i * 4, kind: "spr" }]);
  return (
    <div className="panel"><div className="panel-face state-pal" data-palettes>
      <div className="state-pal-row"><span className="tlab">{T.backdrop}</span><i className="state-swatch" style={{ background: cssOf(pal[0], measured) }} title={`$${hex2(pal[0])}`} data-pal-cell="0">{hex2(pal[0])}</i></div>
      {groups.map((g) => (
        <div className="state-pal-row" key={g.label} data-pal-group={g.kind}>
          <span className="tlab">{g.label}</span>
          {[0, 1, 2, 3].map((k) => {
            // Entry 0 of every palette is the backdrop's mirror; the PPU
            // shows $3F00 there whatever the RAM holds.
            const idx = g.base + k;
            const code = k === 0 ? pal[0] : pal[idx];
            return <i key={k} className="state-swatch" style={{ background: cssOf(code, measured) }} title={`$3F${hex2(idx)}: $${hex2(code)}`} data-pal-cell={idx}>{hex2(code)}</i>;
          })}
        </div>
      ))}
    </div></div>
  );
}

function Oam({ m, T, onTile }: { m: Machine; T: Words; onTile?: (tile: number) => void }) {
  const tall = (m.ppu.ctrl & 0x20) !== 0;
  const table = (m.ppu.ctrl >> 3) & 1;
  const rows = [];
  for (let i = 0; i < 64; i++) {
    const y = m.oam[i * 4], tile = m.oam[i * 4 + 1], attr = m.oam[i * 4 + 2], x = m.oam[i * 4 + 3];
    if (y >= 0xef) continue;
    // Tall sprites take their table from bit 0 of the tile byte.
    const at = tall ? ((tile & 1) * 256 + (tile & 0xfe)) : table * 256 + tile;
    rows.push(
      <tr key={i} data-oam-row={i}>
        <td className="num">{i}</td>
        <td className="num">{x}</td>
        <td className="num">{y}</td>
        <td className="num"><button type="button" className="linkish" onClick={() => onTile?.(at)} title={T.open} data-oam-tile={at}>${hex2(tile)}</button></td>
        <td className="num">{attr & 3}</td>
        <td>{attr & 0x40 ? "H" : ""}{attr & 0x80 ? "V" : ""}</td>
        <td>{attr & 0x20 ? T.yes : ""}</td>
      </tr>,
    );
  }
  // A box of fixed height: sprites come and go every frame, and a table
  // that grew with them moved every section below (owner, 2026-09-23).
  return (
    <div className="panel"><div className="panel-face state-oam">
      {rows.length === 0 ? (
        <p className="quiet" data-oam-none>{T.oamNone}</p>
      ) : (
        <table className="readout" data-oam>
          <thead><tr>{T.oamCols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows}</tbody>
        </table>
      )}
    </div></div>
  );
}
