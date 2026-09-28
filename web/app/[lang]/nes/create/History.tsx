"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { readHistory, type Step } from "@/lib/history";
import { readHistoryBytes, serverSnapshot, setHistory, snapshot, stepBack, subscribe } from "../play/playEngine";
// The 6502 site's disassembler, as the code window uses it.
import { disassemble } from "../../../../public/6502/games/disasm.js";

/**
 * The History window: the instructions the console just ran, read out of
 * its own trace (lib/history.ts), newest at the bottom, so scrolling up
 * goes back in time. Each line is the instruction, the registers going
 * into it, and the memory it read and wrote. Steps back put the machine
 * itself back, a step at a time (playEngine's stepBack).
 */

/** How much of the trace to read: about eight thousand instructions. */
const READ_BYTES = 256 * 1024;
/** How many of them to list. */
const SHOW = 400;

const S = {
  en: {
    h: "History",
    what: "The instructions the console just ran, newest at the bottom: scroll up to go back. Each line has the registers going into it and the memory it read and wrote.",
    on: "Keep a history",
    onTitle: "The console writes down every cycle while this is on, which slows it down",
    off: "Stop keeping it",
    cost: "Keeping a history slows the console down, so it is off until you turn it on.",
    running: "Pause to read the history.",
    empty: "Nothing yet: run or step the console.",
    back: (n: number) => (n ? `Step back (${n})` : "Step back"),
    backTitle: "Puts the console back where it was before the last step",
    cols: ["address", "instruction", "A", "X", "Y", "S", "P", "read and wrote"],
    none: "No cartridge: nothing to read.",
    shown: (n: number, of: number) => `the last ${n} of ${of} instructions read back`,
  },
  ja: {
    h: "履歴",
    what: "コンソールがいま実行した命令。いちばん新しいものが下にあり、上へスクロールすると過去へ戻る。各行には、その命令に入るときのレジスタと、読み書きしたメモリがある。",
    on: "履歴を残す",
    onTitle: "これがオンの間、コンソールはすべてのサイクルを書き留めるので遅くなる",
    off: "残すのをやめる",
    cost: "履歴を残すとコンソールが遅くなるので、オンにするまではオフ。",
    running: "履歴を読むには一時停止する。",
    empty: "まだ何も無い: コンソールを動かすか、ステップする。",
    back: (n: number) => (n ? `一歩戻る (${n})` : "一歩戻る"),
    backTitle: "最後のステップの前の状態へコンソールを戻す",
    cols: ["アドレス", "命令", "A", "X", "Y", "S", "P", "読み書き"],
    none: "カートリッジが無い: 読むものが無い。",
    shown: (n: number, of: number) => `読み戻した ${of} の命令のうち最後の ${n}`,
  },
} as const;

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

function text(st: Step): string {
  const d = disassemble(st.opcode, st.pc, (a: number) => st.operand[(a - st.pc - 1 + 0x10000) & 0xffff] ?? 0);
  return d.text;
}

export function History({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [read, setRead] = useState<{ moves: number; steps: Step[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!s.history || s.running) return;
    let live = true;
    const moves = s.moves;
    void readHistoryBytes(READ_BYTES).then((b) => live && b && setRead({ moves, steps: readHistory(b) }));
    return () => {
      live = false;
    };
  }, [s.history, s.running, s.moves]);

  const steps = read && s.history && !s.running ? read.steps : null;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps]);

  const shown = steps ? steps.slice(-SHOW) : [];
  return (
    <section className="wb-page play-section" id="history" data-history={s.history ? "on" : "off"}>
      <h2 className="eyebrow">{T.h}</h2>
      <p className="quiet">{T.what}</p>
      {!s.loaded ? (
        <p className="quiet">{T.none}</p>
      ) : (
        <p className="chips">
          <button type="button" className={s.history ? "btn" : "btn btn-primary"} title={T.onTitle} aria-pressed={s.history} disabled={!s.powered} onClick={() => void setHistory(!s.history)} data-history-toggle>
            {s.history ? T.off : T.on}
          </button>
          <button type="button" className="btn" title={T.backTitle} disabled={!s.history || s.running || s.backDepth === 0} onClick={() => void stepBack()} data-history-back={s.backDepth}>
            {T.back(s.backDepth)}
          </button>
        </p>
      )}
      {!s.history ? (
        <p className="quiet">{T.cost}</p>
      ) : s.running ? (
        <p className="quiet" data-history-running>{T.running}</p>
      ) : steps && steps.length === 0 ? (
        <p className="quiet">{T.empty}</p>
      ) : steps ? (
        <>
          <p className="quiet" data-history-count={shown.length}>{T.shown(shown.length, steps.length)}</p>
          <div className="panel"><div className="panel-face code-box" ref={box}>
            <table className="readout history-list">
              <thead><tr>{T.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {shown.map((st, i) => (
                  <tr key={i} data-history-pc={hex4(st.pc)} aria-current={i === shown.length - 1 ? "true" : undefined}>
                    <td className="num">{hex4(st.pc)}</td>
                    <td>{text(st)}</td>
                    {st.regs ? (
                      <>
                        <td className="num">{hex2(st.regs.a)}</td>
                        <td className="num">{hex2(st.regs.x)}</td>
                        <td className="num">{hex2(st.regs.y)}</td>
                        <td className="num">{hex2(st.regs.s)}</td>
                        <td className="num">{hex2(st.regs.p)}</td>
                      </>
                    ) : (
                      <td colSpan={5} />
                    )}
                    <td>{st.touched.slice(0, 3).map((t) => `${t.write ? "W" : "R"} $${hex4(t.addr)}=${hex2(t.value)}`).join("  ")}{st.touched.length > 3 ? " …" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </>
      ) : null}
    </section>
  );
}
