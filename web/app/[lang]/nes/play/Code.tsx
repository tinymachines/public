"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { snapshot, serverSnapshot, subscribe } from "./playEngine";
// The 6502 site's disassembler, the one table of the documented opcodes,
// served beside the console's modules (lib/console-modules.ts says why).
import { disassemble } from "../../../../public/6502/games/disasm.js";

/**
 * The code panel: the fifth step of notes/workbench.md.
 *
 * The listing is the bus from the program counter, disassembled forward
 * with the 6502 site's own table and lit at the PC; every step on the
 * transport moves it. Disassembling forward from the PC is the one honest
 * direction: backwards is ambiguous on a 6502, where the same bytes read
 * differently depending on where you start.
 *
 * The listing is a box of fixed height that scrolls itself, and the
 * selection line under it keeps its height whether or not there is a
 * selection: every step redraws the listing, and a box that grew or shrank
 * with it moved everything below (owner, 2026-09-23: "violent redraws").
 * The lit line is kept in view inside the box, never by scrolling the page.
 *
 * A block is a run of that listing the reader selected (a click, then a
 * click further down), given a label and a note, and kept here in the
 * page. It carries the cartridge's digest, the address range, the bytes
 * and the text, so it can be exported as the encyclopedia's own shape
 * (docs/nes/encyclopedia.md: a listing of `ADDR  MNEM operand ; comment`
 * under the block's name) or as JSON. Keeping blocks on the shelf, beside
 * the revisions, is the step after this one; nothing here goes to the
 * server, and for a game somebody else owns the bytes stay with the
 * reader (NOTICE.md, "Somebody else's game").
 */

const S = {
  en: {
    h: "Code",
    none: "No cartridge: nothing to read.",
    off: "Power is off: nothing to read.",
    noReads: "This bundle has no reads; the listing waits on the boarded console.",
    from: (pc: number) => <>from the program counter, <b>${hex4(pc)}</b>; the lit line is the next instruction</>,
    select: "Click a line, then a line further down, to select a block.",
    selected: (a: number, b: number, n: number) => <>selected <b>${hex4(a)}</b> to <b>${hex4(b)}</b>, {n} {n === 1 ? "instruction" : "instructions"}</>,
    capture: "Capture the selection as a block",
    clear: "Clear the selection",
    blocksH: "Captured blocks",
    noBlocks: "no blocks captured yet",
    label: "Label",
    note: "Note",
    labelHint: "what this code is",
    noteHint: "what it does, and how you know",
    remove: "Remove",
    exportMd: "Download the blocks (markdown)",
    exportJson: "Download the blocks (JSON)",
    stays: "Blocks stay in this page. Keeping them on the shelf beside the revisions is the next step; a block from a game you do not own carries its bytes, which are the game's.",
    cols: ["address", "bytes", "instruction"],
  },
  ja: {
    h: "コード",
    none: "カートリッジが無い: 読むものが無い。",
    off: "電源が切れている: 読むものが無い。",
    noReads: "このバンドルには読み出しが無い。リストは搭載されたコンソールを待っている。",
    from: (pc: number) => <>プログラムカウンタ <b>${hex4(pc)}</b> から。光っている行が次の命令</>,
    select: "行をクリックし、さらに下の行をクリックするとブロックを選べる。",
    selected: (a: number, b: number, n: number) => <><b>${hex4(a)}</b> から <b>${hex4(b)}</b> まで、{n} 命令を選択</>,
    capture: "選択をブロックとして取り込む",
    clear: "選択を解除",
    blocksH: "取り込んだブロック",
    noBlocks: "ブロックはまだ無い",
    label: "ラベル",
    note: "メモ",
    labelHint: "このコードは何か",
    noteHint: "何をするか、そしてなぜそう分かるか",
    remove: "削除",
    exportMd: "ブロックをダウンロード（markdown）",
    exportJson: "ブロックをダウンロード（JSON）",
    stays: "ブロックはこのページに留まる。棚にリビジョンと並べて残すのは次の段階。自分のものでないゲームのブロックは、そのゲームのバイトを含む。",
    cols: ["アドレス", "バイト", "命令"],
  },
} as const;

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

interface Line {
  at: number;
  bytes: number[];
  text: string;
}

/** A captured block: where, what was there, and what the reader says about it. */
export interface Block {
  id: number;
  cart: string | null;
  from: number;
  to: number;
  lines: Line[];
  label: string;
  note: string;
}

/** The listing: `n` instructions from the code bytes, each with its address, bytes and text. */
function listing(code: Uint8Array, at: number, n: number): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (out.length < n && i < code.length) {
    const op = code[i];
    const d = disassemble(op, (at + i) & 0xffff, (a: number) => code[(a - at + 0x10000) & 0xffff] ?? 0);
    const len = d.length;
    if (i + len > code.length) break;
    out.push({ at: (at + i) & 0xffff, bytes: Array.from(code.subarray(i, i + len)), text: d.text });
    i += len;
  }
  return out;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The blocks in the encyclopedia's shape: a heading, the note, the listing. */
function markdownOf(blocks: Block[], cart: string | null): string {
  const parts = [`# Captured blocks${cart ? `\n\ncartridge sha256: ${cart}` : ""}`];
  blocks.forEach((b, i) => {
    parts.push(`\n## ${i + 1}. ${b.label || `$${hex4(b.from)}`}\n`);
    if (b.note) parts.push(`**What it does.** ${b.note}\n`);
    parts.push("**The code.**\n\n```\n" + b.lines.map((l) => `${hex4(l.at)}  ${l.text}`).join("\n") + "\n```");
  });
  return parts.join("\n") + "\n";
}

export function Code({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const m = s.machine;
  const why = !s.loaded ? T.none : !s.powered ? T.off : !m ? T.noReads : null;
  const lines = useMemo(() => (m ? listing(m.code, m.codeAt, 32) : []), [m]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [nextId, setNextId] = useState(1);
  const sel = anchor !== null && end !== null ? { from: Math.min(anchor, end), to: Math.max(anchor, end) } : null;
  const selectedLines = sel ? lines.filter((l) => l.at >= sel.from && l.at <= sel.to) : [];
  const cart = s.cart?.sha256 ?? null;

  const pick = (at: number) => {
    if (anchor === null || end !== null) {
      setAnchor(at);
      setEnd(null);
    } else {
      setEnd(at);
    }
  };
  const capture = () => {
    if (!sel || selectedLines.length === 0) return;
    setBlocks((bs) => [...bs, { id: nextId, cart, from: sel.from, to: sel.to, lines: selectedLines, label: "", note: "" }]);
    setNextId((n) => n + 1);
    setAnchor(null);
    setEnd(null);
  };
  const stem = (s.loaded ?? "cartridge").replace(/\.nes$/i, "");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const lit = el?.querySelector<HTMLElement>("tr[aria-current]");
    if (!el || !lit) return;
    const top = lit.offsetTop - el.clientHeight / 3;
    if (Math.abs(el.scrollTop - top) > el.clientHeight / 3) el.scrollTop = Math.max(0, top);
  }, [lines]);

  return (
    <section className="wb-page play-section" id="code" data-code data-code-blocks={blocks.length}>
      <h2 className="eyebrow">{T.h}</h2>
      {why ? (
        <p className="quiet" data-code-why>{why}</p>
      ) : (
        <>
          <p className="quiet">{T.from(m!.codeAt)} {T.select}</p>
          <div className="panel"><div className="panel-face code-box" ref={box}>
            <table className="readout code-list" data-code-list={hex4(m!.codeAt)}>
              <thead><tr>{T.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {lines.map((l) => {
                  const lit = l.at === m!.cpu.pc;
                  const inSel = sel ? l.at >= sel.from && l.at <= sel.to : anchor === l.at;
                  return (
                    <tr key={l.at} aria-current={lit ? "true" : undefined} aria-selected={inSel || undefined} onClick={() => pick(l.at)} data-code-line={hex4(l.at)} className={(lit ? "lit" : "") + (inSel ? " picked" : "")}>
                      <td className="num">{hex4(l.at)}</td>
                      <td className="num">{l.bytes.map(hex2).join(" ")}</td>
                      <td>{l.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
          <div className="chips code-sel">
            <span className="quiet" data-code-selection={sel ? selectedLines.length : 0}>{sel ? T.selected(sel.from, sel.to, selectedLines.length) : T.select}</span>
            <button type="button" className="btn btn-primary" disabled={!sel || selectedLines.length === 0} onClick={capture} data-code-capture>{T.capture}</button>
            <button type="button" className="btn btn-ghost" disabled={anchor === null} onClick={() => { setAnchor(null); setEnd(null); }} data-code-clear>{T.clear}</button>
          </div>
        </>
      )}

      <h3 className="eyebrow">{T.blocksH}</h3>
      {blocks.length === 0 ? (
        <p className="quiet" data-code-none>{T.noBlocks}</p>
      ) : (
        <ul className="code-blocks">
          {blocks.map((b) => (
            <li key={b.id} data-code-block={hex4(b.from)}>
              <div className="form-grid">
                <label className="field"><span>{T.label}</span><input className="input" value={b.label} placeholder={T.labelHint} maxLength={80} onChange={(e) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))} data-code-label /></label>
                <label className="field"><span>{T.note}</span><input className="input" value={b.note} placeholder={T.noteHint} maxLength={240} onChange={(e) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, note: e.target.value } : x)))} data-code-note /></label>
              </div>
              <pre className="code"><code>{b.lines.map((l) => `${hex4(l.at)}  ${l.text}`).join("\n")}</code></pre>
              <p className="chips">
                <span className="measured">${hex4(b.from)} to ${hex4(b.to)}, {b.lines.length} {b.lines.length === 1 ? "instruction" : "instructions"}</span>
                <button type="button" className="btn btn-ghost" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} data-code-remove>{T.remove}</button>
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="chips">
        <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => download(`${stem}.blocks.md`, markdownOf(blocks, cart), "text/markdown")} data-code-export-md>{T.exportMd}</button>
        <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => download(`${stem}.blocks.json`, JSON.stringify({ cart, blocks: blocks.map(({ id: _id, ...b }) => b) }, null, 2), "application/json")} data-code-export-json>{T.exportJson}</button>
      </div>
      <p className="quiet">{T.stays}</p>
    </section>
  );
}
