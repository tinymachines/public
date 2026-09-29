"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { clearBreakpoints, snapshot, serverSnapshot, subscribe, toggleBreakpoint } from "./playEngine";
import { addBlock, announceChange, deleteBlock, listBlocks, patchBlock, ShelfError, type Block as ShelfBlock } from "@/lib/shelf";
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
 * click further down), given a label and a note. It carries the
 * cartridge's digest, the address range, the bytes and the text, so it can
 * be exported as the encyclopedia's own shape (docs/nes/encyclopedia.md: a
 * listing of `ADDR  MNEM operand ; comment` under the block's name) or as
 * JSON. For a cartridge from the shelf the blocks are kept there, beside
 * the revisions (lib/shelf.ts, api/carts.py), and come back when the
 * cartridge is loaded from the shelf again; the bytes go only to the
 * reader's own shelf, where the game already is (NOTICE.md, "Somebody
 * else's game"). A cartridge from the disk has no shelf, and its blocks
 * stay in the page, as every block did until 2026-09-29.
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
    stays: "This cartridge came from your disk, so its blocks stay in this page. Put the cartridge on your shelf and load it from there to keep them.",
    kept: "Blocks are kept on your shelf beside the revisions, and come back when you load this cartridge from there. A block carries the game's bytes, and they go nowhere but your own shelf, where the game already is.",
    keeping: "keeping",
    cols: ["stop", "address", "bytes", "instruction"],
    stopped: (a: number) => <>stopped at the breakpoint at <b>${hex4(a)}</b>, the instruction there about to run</>,
    bpTitle: (a: number) => `Stop here: a run stops as the CPU begins to fetch the instruction at $${hex4(a)}`,
    bpsH: "Breakpoints",
    bpsNone: "none set: press a dot in the listing, or add an address",
    bpAdd: "Add",
    bpAt: "address, in hex",
    bpClear: "Clear all",
    bpRemove: (a: number) => `Remove the breakpoint at $${hex4(a)}`,
    bpBank: "An address stops the run whichever bank is mapped there.",
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
    stays: "このカートリッジはディスクから来たので、ブロックはこのページに留まる。カートリッジを棚に置き、そこから読み込めば残る。",
    kept: "ブロックは棚にリビジョンと並べて残り、このカートリッジを棚から読み込むと戻ってくる。ブロックはゲームのバイトを運ぶが、行き先はゲームがすでにあるあなたの棚だけだ。",
    keeping: "保存中",
    cols: ["停止", "アドレス", "バイト", "命令"],
    stopped: (a: number) => <>ブレークポイント <b>${hex4(a)}</b> で止まった。そこの命令がこれから走る</>,
    bpTitle: (a: number) => `ここで止める: CPU が $${hex4(a)} の命令を読み始めたところで実行が止まる`,
    bpsH: "ブレークポイント",
    bpsNone: "無し: リストの点を押すか、アドレスを足す",
    bpAdd: "足す",
    bpAt: "アドレス (16 進)",
    bpClear: "すべて消す",
    bpRemove: (a: number) => `$${hex4(a)} のブレークポイントを消す`,
    bpBank: "アドレスは、そこにどのバンクが載っていても実行を止める。",
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
  /** Its id on the shelf, for a cartridge from there; null for a block that lives in the page. */
  shelfId: string | null;
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

const hexOf = (lines: Line[]) => lines.flatMap((l) => l.bytes).map(hex2).join("");
const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));

/** A block as the shelf keeps it, its listing disassembled again from the bytes. */
function fromShelf(b: ShelfBlock, id: number, cart: string | null): Block {
  const bytes = fromHex(b.bytes);
  return { id, shelfId: b.id, cart, from: b.at, to: b.to, lines: listing(bytes, b.at, bytes.length), label: b.label, note: b.note };
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
  const nextId = useRef(1);
  const sel = anchor !== null && end !== null ? { from: Math.min(anchor, end), to: Math.max(anchor, end) } : null;
  const selectedLines = sel ? lines.filter((l) => l.at >= sel.from && l.at <= sel.to) : [];
  const cart = s.cart?.sha256 ?? null;
  // The shelf's cartridge, when the one loaded came from there: its blocks
  // are the shelf's, listed when it arrives and written as they change.
  const shelf = s.cart;
  const shelfId = shelf?.id ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [shelfWhy, setShelfWhy] = useState<string | null>(null);
  // Another cartridge is another set of blocks. Adjusted during render, as
  // the sprite sheet drops its edits, so the old blocks never show under
  // the new cartridge for a frame.
  const [lastShelf, setLastShelf] = useState(shelfId);
  if (lastShelf !== shelfId) {
    setLastShelf(shelfId);
    setBlocks([]);
    setShelfWhy(null);
  }
  useEffect(() => {
    if (!shelfId) return;
    let live = true;
    const sha = cart;
    void listBlocks(shelfId)
      .then((r) => {
        if (!live) return;
        setBlocks(r.blocks.map((b) => fromShelf(b, nextId.current++, sha)));
      })
      .catch((e) => {
        if (live) setShelfWhy(e instanceof ShelfError ? e.message : String((e as Error).message ?? e));
      });
    return () => {
      live = false;
    };
    // The digest travels with the id; a new cartridge is a new id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfId]);
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
    const at = selectedLines[0].at;
    const to = selectedLines[selectedLines.length - 1].at;
    setAnchor(null);
    setEnd(null);
    if (shelfId) {
      void shelfCall("keep", async () => {
        const kept = await addBlock(shelfId, { at, to, bytes: hexOf(selectedLines) });
        setBlocks((bs) => [...bs, fromShelf(kept, nextId.current++, cart)]);
        announceChange();
      });
      return;
    }
    setBlocks((bs) => [...bs, { id: nextId.current++, shelfId: null, cart, from: at, to, lines: selectedLines, label: "", note: "" }]);
  };
  /** The words changed on a block: the page's copy at once, the shelf's when the field is left. */
  const word = (b: Block, field: "label" | "note", value: string) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, [field]: value } : x)));
  const keepWords = (b: Block) => {
    if (!shelfId || !b.shelfId) return;
    void shelfCall(`words ${b.shelfId}`, async () => {
      await patchBlock(shelfId, b.shelfId!, { label: b.label, note: b.note });
    });
  };
  const remove = (b: Block) => {
    if (shelfId && b.shelfId) {
      void shelfCall(`remove ${b.shelfId}`, async () => {
        await deleteBlock(shelfId, b.shelfId!);
        setBlocks((bs) => bs.filter((x) => x.id !== b.id));
        announceChange();
      });
      return;
    }
    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
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
    <section className="wb-page play-section" id="code" data-code data-code-blocks={blocks.length} data-code-shelf={shelfId ? "shelf" : "page"}>
      <h2 className="eyebrow">{T.h}</h2>
      {why ? (
        <p className="quiet" data-code-why>{why}</p>
      ) : (
        <>
          <p className="quiet" data-code-stopped={s.stoppedAt === null ? undefined : hex4(s.stoppedAt)}>{s.stoppedAt !== null ? T.stopped(s.stoppedAt) : T.from(m!.codeAt)} {T.select}</p>
          <div className="panel"><div className="panel-face code-box" ref={box}>
            <table className="readout code-list" data-code-list={hex4(m!.codeAt)}>
              <thead><tr>{T.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {lines.map((l) => {
                  const lit = l.at === m!.cpu.pc;
                  const inSel = sel ? l.at >= sel.from && l.at <= sel.to : anchor === l.at;
                  return (
                    <tr key={l.at} aria-current={lit ? "true" : undefined} aria-selected={inSel || undefined} onClick={() => pick(l.at)} data-code-line={hex4(l.at)} className={(lit ? "lit" : "") + (inSel ? " picked" : "")}>
                      <td>
                        <button type="button" className="code-bp" aria-pressed={s.breakpoints.includes(l.at)} title={T.bpTitle(l.at)} aria-label={T.bpTitle(l.at)} onClick={(e) => { e.stopPropagation(); toggleBreakpoint(l.at); }} data-code-bp={hex4(l.at)}>
                          {s.breakpoints.includes(l.at) ? "\u25cf" : "\u25cb"}
                        </button>
                      </td>
                      <td className="num">{hex4(l.at)}</td>
                      <td className="num">{l.bytes.map(hex2).join(" ")}</td>
                      <td>{l.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
          <Breakpoints lang={lang} />
          <div className="chips code-sel">
            <span className="quiet" data-code-selection={sel ? selectedLines.length : 0}>{sel ? T.selected(sel.from, sel.to, selectedLines.length) : T.select}</span>
            <button type="button" className="btn btn-primary" disabled={!sel || selectedLines.length === 0 || busy !== null} onClick={capture} data-code-capture>{busy === "keep" ? T.keeping : T.capture}</button>
            <button type="button" className="btn btn-ghost" disabled={anchor === null} onClick={() => { setAnchor(null); setEnd(null); }} data-code-clear>{T.clear}</button>
          </div>
        </>
      )}

      <h3 className="eyebrow">{T.blocksH}</h3>
      {shelfWhy ? <p className="notice fail" data-code-shelf-why>{shelfWhy}</p> : null}
      {blocks.length === 0 ? (
        <p className="quiet" data-code-none>{T.noBlocks}</p>
      ) : (
        <ul className="code-blocks">
          {blocks.map((b) => (
            <li key={b.id} data-code-block={hex4(b.from)} data-code-block-kept={b.shelfId ? "shelf" : "page"}>
              <div className="form-grid">
                <label className="field"><span>{T.label}</span><input className="input" value={b.label} placeholder={T.labelHint} maxLength={80} onChange={(e) => word(b, "label", e.target.value)} onBlur={(e) => keepWords({ ...b, label: e.target.value })} data-code-label /></label>
                <label className="field"><span>{T.note}</span><input className="input" value={b.note} placeholder={T.noteHint} maxLength={240} onChange={(e) => word(b, "note", e.target.value)} onBlur={(e) => keepWords({ ...b, note: e.target.value })} data-code-note /></label>
              </div>
              <pre className="code"><code>{b.lines.map((l) => `${hex4(l.at)}  ${l.text}`).join("\n")}</code></pre>
              <p className="chips">
                <span className="measured">${hex4(b.from)} to ${hex4(b.to)}, {b.lines.length} {b.lines.length === 1 ? "instruction" : "instructions"}</span>
                <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => remove(b)} data-code-remove>{T.remove}</button>
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="chips">
        <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => download(`${stem}.blocks.md`, markdownOf(blocks, cart), "text/markdown")} data-code-export-md>{T.exportMd}</button>
        <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => download(`${stem}.blocks.json`, JSON.stringify({ cart, blocks: blocks.map(({ id: _id, shelfId: _shelf, ...b }) => b) }, null, 2), "application/json")} data-code-export-json>{T.exportJson}</button>
      </div>
      <p className="quiet">{shelfId ? T.kept : T.stays}</p>
    </section>
  );
}

/** The breakpoints set, each removable, and a field for any address. */
function Breakpoints({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [text, setText] = useState("");
  const addr = /^\$?[0-9a-fA-F]{1,4}$/.test(text.trim()) ? parseInt(text.trim().replace("$", ""), 16) : null;
  return (
    <div className="chips code-bps" data-code-bps={s.breakpoints.length}>
      <span className="eyebrow">{T.bpsH}</span>
      {s.breakpoints.length === 0 ? <span className="quiet">{T.bpsNone}</span> : null}
      {s.breakpoints.map((a) => (
        <button key={a} type="button" className="btn btn-ghost" title={T.bpRemove(a)} aria-label={T.bpRemove(a)} onClick={() => toggleBreakpoint(a)} data-code-bp-set={hex4(a)}>
          ${hex4(a)} {"\u00d7"}
        </button>
      ))}
      <form
        className="chips code-bp-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (addr === null) return;
          if (!s.breakpoints.includes(addr)) toggleBreakpoint(addr);
          setText("");
        }}
      >
        <input className="input" size={6} value={text} placeholder="$8000" aria-label={T.bpAt} onChange={(e) => setText(e.target.value)} data-code-bp-input />
        <button type="submit" className="btn" disabled={addr === null} data-code-bp-add>{T.bpAdd}</button>
      </form>
      {s.breakpoints.length ? <button type="button" className="btn btn-ghost" onClick={clearBreakpoints} data-code-bp-clear>{T.bpClear}</button> : null}
      <span className="quiet">{T.bpBank}</span>
    </div>
  );
}
