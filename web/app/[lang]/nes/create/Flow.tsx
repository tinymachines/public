"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import * as flow from "./flowEngine";
import type { Report } from "./flowEngine";

/**
 * The Flow window: what one recorded run's code did, read from its trace
 * by wasm/flow. Every figure here is the report's, measured on the replay
 * of the recording; nothing is typed. One view at a time, chosen by the
 * keys under the heading.
 */

type View = "overview" | "modes" | "routines" | "loops" | "tables" | "pad" | "vars" | "raw";
const VIEWS: View[] = ["overview", "modes", "routines", "loops", "tables", "pad", "vars", "raw"];
const SECONDS = (f: number) => f / 60.0988;

const S = {
  en: {
    h: "Flow",
    none: "Nothing open. Record a run, then read it in the Record window.",
    views: { overview: "Overview", modes: "Modes", routines: "Routines", loops: "Loops", tables: "Tables", pad: "Pad", vars: "Variables", raw: "Raw" } as Record<View, string>,
    of: (name: string, f: number) => <>the run of <b>{name}</b>, {f} frames ({SECONDS(f).toFixed(1)} s)</>,
    ov: (r: Report, idle: number) => (
      <>
        The CPU ran <b>{r.instructions.toLocaleString("en")}</b> instructions in <b>{r.cycles.toLocaleString("en")}</b> cycles, of which{" "}
        <b>{r.held.toLocaleString("en")}</b> were held for the sprite copy and the sample fetches. It spent <b>{(idle * 100).toFixed(1)}%</b> of its time in loops that wait for nothing but the next frame.{" "}
        <b>{r.sites.length.toLocaleString("en")}</b> different instructions ran, in <b>{r.routines.length.toLocaleString("en")}</b> routines.
      </>
    ),
    undocumented: (n: number) => <><b>{n}</b> of them use opcodes the part does not document.</>,
    modesWhat: "Stretches of the run where the same routines ran, told apart by where that changed. Stretches that look alike share a mode.",
    mode: (i: number) => `mode ${i + 1}`,
    frames: (a: number, b: number) => `frames ${a} to ${b}`,
    own: "its own routines",
    noOwn: "nothing only it runs",
    rWhat: "Every place code was entered, by a call, an interrupt or a jump through a table, with the time spent in it and in what it called. Pick one to see its code.",
    cols: { at: "at", how: "entered", from: "called from", frames: "frames", incl: "with calls", excl: "itself", tags: "drives" },
    how: { reset: "power-on", nmi: "each frame (NMI)", irq: "IRQ", brk: "BRK", call: "call", dispatch: "table" } as Record<string, string>,
    more: (n: number) => `and ${n} more`,
    code: "Its code, as it ran",
    ccols: ["address", "instruction", "times", "first frame"],
    mem: "What it read and wrote",
    mcols: ["address", "reads", "writes"],
    callers: "Called from",
    callees: "Calls",
    lWhat: "Every backward jump the game took, and what the loop was doing: idling on itself, waiting for something to change, or working.",
    lcols: ["from", "to", "kind", "times round", "times entered", "waits on", "in"],
    kind: { idle: "idle", wait: "wait", work: "work" } as Record<string, string>,
    tWhat: "Jumps through a table: where the game chose between routines by a number, which one it chose, and when. The shallowest are usually the game's own states.",
    depth: (d: number) => `call depth ${d}`,
    pWhat: "Routines that ran while a button was held, or just after it was pressed, and much less otherwise.",
    held: (n: number, p: number) => `held for ${n} frames, pressed ${p} times`,
    whileHeld: "while held",
    afterPress: "after a press",
    nobody: "nothing stands out",
    vWhat: "RAM that one routine writes and another reads: the variables the game's parts share.",
    vcols: ["address", "written by", "read by"],
    rawWhat: "The trace itself, one record per CPU cycle as the console writes it (nes-console's record.rs): every bus access with its place in the ROM, the registers at each instruction, the pad and the frames. About 19 MB for each second of play, so a stretch at a time.",
    from: "from frame",
    to: "to frame",
    saveTrace: "Save the trace",
    saveReport: "Download the report (JSON)",
    gaps: "What this does not see: a return to somewhere other than where the call came from (the RTS trick) is followed as a return, not as a jump through a table; code that runs from RAM is keyed by its address.",
  },
  ja: {
    h: "フロー",
    none: "開いているものは無い。走らせて記録し、記録のウィンドウで読む。",
    views: { overview: "概要", modes: "モード", routines: "ルーチン", loops: "ループ", tables: "テーブル", pad: "パッド", vars: "変数", raw: "生データ" } as Record<View, string>,
    of: (name: string, f: number) => <><b>{name}</b> の走行、{f} フレーム（{SECONDS(f).toFixed(1)} 秒）</>,
    ov: (r: Report, idle: number) => (
      <>
        CPU は <b>{r.cycles.toLocaleString("ja")}</b> サイクルで <b>{r.instructions.toLocaleString("ja")}</b> 命令を実行し、そのうち{" "}
        <b>{r.held.toLocaleString("ja")}</b> サイクルはスプライトの転送とサンプルの読み出しのために止められていた。時間の <b>{(idle * 100).toFixed(1)}%</b> は次のフレームを待つだけのループにいた。実行された命令は <b>{r.sites.length.toLocaleString("ja")}</b> 種類、ルーチンは <b>{r.routines.length.toLocaleString("ja")}</b> 個。
      </>
    ),
    undocumented: (n: number) => <>そのうち <b>{n}</b> 個は、チップが文書化していないオペコードを使う。</>,
    modesWhat: "同じルーチンが走っていた区間。それが変わった所で区切る。似た区間は同じモードになる。",
    mode: (i: number) => `モード ${i + 1}`,
    frames: (a: number, b: number) => `フレーム ${a} から ${b}`,
    own: "そのモードだけのルーチン",
    noOwn: "そのモードだけで走るものは無い",
    rWhat: "コードに入った場所のすべて。呼び出し、割り込み、テーブル経由のジャンプのどれで入ったか、そこで使った時間と、そこから呼んだ先を含めた時間。選ぶとそのコードが見える。",
    cols: { at: "場所", how: "入り方", from: "呼び出し元", frames: "フレーム", incl: "呼び出し込み", excl: "それ自身", tags: "動かすもの" },
    how: { reset: "電源投入", nmi: "毎フレーム（NMI）", irq: "IRQ", brk: "BRK", call: "呼び出し", dispatch: "テーブル" } as Record<string, string>,
    more: (n: number) => `ほか ${n} 個`,
    code: "実行されたとおりのコード",
    ccols: ["アドレス", "命令", "回数", "最初のフレーム"],
    mem: "読んだものと書いたもの",
    mcols: ["アドレス", "読み", "書き"],
    callers: "呼び出し元",
    callees: "呼び出し先",
    lWhat: "ゲームが取った後ろ向きのジャンプのすべてと、そのループが何をしていたか: 自分自身で待機、何かが変わるのを待つ、仕事をする。",
    lcols: ["から", "へ", "種類", "周回", "入った回数", "待つ相手", "ルーチン"],
    kind: { idle: "待機", wait: "待ち", work: "仕事" } as Record<string, string>,
    tWhat: "テーブル経由のジャンプ: ゲームが番号でルーチンを選んだ場所、どれを選んだか、そしていつか。一番浅いものはたいていゲーム自身の状態。",
    depth: (d: number) => `呼び出しの深さ ${d}`,
    pWhat: "ボタンを押している間、または押した直後に走り、それ以外ではあまり走らないルーチン。",
    held: (n: number, p: number) => `${n} フレーム押され、${p} 回押された`,
    whileHeld: "押している間",
    afterPress: "押した直後",
    nobody: "目立つものは無い",
    vWhat: "あるルーチンが書き、別のルーチンが読む RAM: ゲームの部分どうしが共有する変数。",
    vcols: ["アドレス", "書くもの", "読むもの"],
    rawWhat: "トレースそのもの。コンソールが書くとおり CPU サイクルごとに一件（nes-console の record.rs）: ROM 内の位置付きのバスアクセス、命令ごとのレジスタ、パッド、フレーム。遊ぶ一秒ごとに約 19 MB なので、一区間ずつ。",
    from: "フレーム",
    to: "から",
    saveTrace: "トレースを保存",
    saveReport: "レポートをダウンロード（JSON）",
    gaps: "これが見ないもの: 呼ばれた所とは別の場所へ戻る RTS の技は、テーブル経由のジャンプではなく戻りとして扱う。RAM から走るコードはそのアドレスで区別する。",
  },
} as const;

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "0%");

export function Flow({ lang }: { lang: Lang }) {
  const T = S[lang];
  const f = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.serverSnapshot);
  const [view, setView] = useState<View>("overview");
  const o = f.open;
  return (
    <section className="wb-page play-section" id="flow" data-flow data-flow-open={o ? o.meta.id : ""}>
      <h2 className="eyebrow">{T.h}</h2>
      {!o ? (
        <p className="quiet" data-flow-none>{T.none}</p>
      ) : (
        <>
          <p className="quiet">{T.of(o.meta.name, o.report.frames)}</p>
          <div className="chips flow-views" role="group">
            {VIEWS.map((v) => (
              <button key={v} type="button" className="btn btn-ghost" aria-pressed={view === v} onClick={() => setView(v)} data-flow-view={v}>{T.views[v]}</button>
            ))}
          </div>
          <Body key={o.meta.id} r={o.report} view={view} lang={lang} id={o.meta.id} />
        </>
      )}
    </section>
  );
}

function Body({ r, view, lang, id }: { r: Report; view: View; lang: Lang; id: string }) {
  const T = S[lang];
  const [pick, setPick] = useState<number | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(59, Math.max(0, r.frames - 1)));
  const name = (i: number) => `$${hex4(r.routines[i]?.addr ?? 0)}`;
  const idle = useMemo(() => r.timeline.idle.reduce((a, b) => a + b, 0) / Math.max(1, r.cycles), [r]);
  const sorted = useMemo(() => [...r.routines].sort((a, b) => b.incl - a.incl), [r]);
  const bySite = useMemo(() => new Map(r.sites.map((s) => [s.key, s])), [r]);
  const callees = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const rt of r.routines) for (const [c] of rt.callers) (m.get(c) ?? m.set(c, new Set()).get(c)!).add(rt.id);
    return m;
  }, [r]);
  const lang2 = lang === "ja" ? "ja" : "en";

  if (view === "overview") {
    const und = r.sites.filter((s) => !s.documented).length;
    return (
      <div className="prose" data-flow-overview>
        <p>{T.ov(r, idle)} {und ? T.undocumented(und) : null}</p>
        <p className="quiet">{T.gaps}</p>
      </div>
    );
  }

  if (view === "modes") {
    const n = Math.max(1, r.frames);
    return (
      <div data-flow-modes>
        <p className="quiet">{T.modesWhat}</p>
        <div className="flow-bar" role="img" aria-label={r.modes.segments.map(([a, b, m]) => `${T.mode(m)}: ${T.frames(a, b)}`).join("; ")}>
          {r.modes.segments.map(([a, b, m]) => (
            <span key={a} className="flow-seg" data-mode={m % 4} style={{ flexGrow: b - a + 1 }} title={`${T.mode(m)}: ${T.frames(a, b)}`} />
          ))}
        </div>
        <ul className="flow-modes">
          {r.modes.modes.map((m) => (
            <li key={m.id} data-flow-mode={m.id}>
              <span className="flow-key" data-mode={m.id % 4} /> <b>{T.mode(m.id)}</b>{" "}
              <span className="quiet">
                {r.modes.segments.filter((s) => s[2] === m.id).map(([a, b]) => T.frames(a, b)).join(", ")} ({pct(m.frames, n)})
              </span>
              <br />
              <span className="quiet">{m.own.length ? `${T.own}: ${m.own.map(name).join(" ")}` : T.noOwn}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view === "routines") {
    const shown = sorted.slice(0, 200);
    const sel = pick === null ? null : r.routines[pick];
    return (
      <div data-flow-routines>
        <p className="quiet">{T.rWhat}</p>
        <div className="panel"><div className="panel-face flow-scroll">
          <table className="readout flow-table">
            <thead>
              <tr><th>{T.cols.at}</th><th>{T.cols.how}</th><th>{T.cols.from}</th><th>{T.cols.frames}</th><th>{T.cols.incl}</th><th>{T.cols.excl}</th><th>{T.cols.tags}</th></tr>
            </thead>
            <tbody>
              {shown.map((rt) => (
                <tr key={rt.id} onClick={() => setPick(rt.id)} aria-selected={pick === rt.id || undefined} className={pick === rt.id ? "picked" : undefined} data-flow-routine={hex4(rt.addr)}>
                  <td className="num">${hex4(rt.addr)}</td>
                  <td>{T.how[rt.entry]}</td>
                  <td className="num">{rt.callers[0] ? `$${hex4(rt.callers[0][1])}` : ""}</td>
                  <td className="num">{rt.frames}</td>
                  <td className="num">{pct(rt.incl, r.cycles)}</td>
                  <td className="num">{pct(rt.excl, r.cycles)}</td>
                  <td>{rt.tags.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
        {sorted.length > shown.length ? <p className="quiet">{T.more(sorted.length - shown.length)}</p> : null}
        {sel ? (
          <div data-flow-picked={hex4(sel.addr)}>
            <h3 className="eyebrow">{T.code}: ${hex4(sel.addr)} <span className="quiet">PRG ${sel.key.toString(16).toUpperCase()}</span></h3>
            <div className="panel"><div className="panel-face flow-scroll">
              <table className="readout flow-table">
                <thead><tr>{T.ccols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {sel.body.map((k) => bySite.get(k)).filter(Boolean).map((s) => (
                    <tr key={s!.key}><td className="num">${hex4(s!.addr)}</td><td>{s!.text}</td><td className="num">{s!.count.toLocaleString(lang2)}</td><td className="num">{s!.first}</td></tr>
                  ))}
                </tbody>
              </table>
            </div></div>
            <p className="chips">
              <span className="quiet">{T.callers}:</span>
              {sel.callers.length ? sel.callers.slice(0, 12).map(([c, at, n]) => <button type="button" key={`${c}-${at}`} className="btn btn-ghost" onClick={() => setPick(c)}>{name(c)} @ ${hex4(at)} ({n})</button>) : <span className="quiet">{T.how[sel.entry]}</span>}
            </p>
            <p className="chips">
              <span className="quiet">{T.callees}:</span>
              {[...(callees.get(sel.id) ?? [])].slice(0, 24).map((c) => <button type="button" key={c} className="btn btn-ghost" onClick={() => setPick(c)}>{name(c)}</button>)}
            </p>
            {sel.mem.length ? (
              <>
                <h3 className="eyebrow">{T.mem}</h3>
                <div className="panel"><div className="panel-face flow-scroll">
                  <table className="readout flow-table">
                    <thead><tr>{T.mcols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{sel.mem.map(([a, rd, wr]) => <tr key={a}><td className="num">${hex4(a)}</td><td className="num">{rd}</td><td className="num">{wr}</td></tr>)}</tbody>
                  </table>
                </div></div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "loops") {
    return (
      <div data-flow-loops>
        <p className="quiet">{T.lWhat}</p>
        <div className="panel"><div className="panel-face flow-scroll">
          <table className="readout flow-table">
            <thead><tr>{T.lcols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {r.loops.slice(0, 200).map((l) => (
                <tr key={`${l.head}-${l.tail}`} data-flow-loop={hex4(l.head_addr)} data-kind={l.kind}>
                  <td className="num">${hex4(l.tail_addr)}</td>
                  <td className="num">${hex4(l.head_addr)}</td>
                  <td>{T.kind[l.kind]}</td>
                  <td className="num">{l.iterations.toLocaleString(lang2)}</td>
                  <td className="num">{l.entries.toLocaleString(lang2)}</td>
                  <td className="num">{l.on === null ? "" : `$${hex4(l.on)}`}</td>
                  <td className="num">{name(l.routine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>
    );
  }

  if (view === "tables") {
    return (
      <div data-flow-tables>
        <p className="quiet">{T.tWhat}</p>
        <ul className="flow-list">
          {r.dispatch.map((d) => (
            <li key={d.key} data-flow-table={hex4(d.addr)}>
              <b>${hex4(d.addr)}</b> <span className="quiet">{T.depth(d.depth)}</span>
              <br />
              {d.targets.map(([t, n]) => <span key={t} className="tag">{name(t)} ({n})</span>)}
              <br />
              <span className="quiet">
                {d.timeline.slice(0, 16).map(([a, b, t]) => `${T.frames(a, b)} ${name(t)}`).join("; ")}
                {d.timeline.length > 16 ? `; ${T.more(d.timeline.length - 16)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view === "pad") {
    return (
      <div data-flow-pad>
        <p className="quiet">{T.pWhat}</p>
        <ul className="flow-list">
          {r.input.map((b) => (
            <li key={b.button} data-flow-button={b.button}>
              <b>{b.button}</b> <span className="quiet">{T.held(b.held, b.presses)}</span>
              <br />
              <span className="quiet">{T.whileHeld}:</span> {b.while_held.length ? b.while_held.map(([i]) => <span key={i} className="tag">{name(i)}</span>) : <span className="quiet">{T.nobody}</span>}
              <br />
              <span className="quiet">{T.afterPress}:</span> {b.after_press.length ? b.after_press.map(([i]) => <span key={i} className="tag">{name(i)}</span>) : <span className="quiet">{T.nobody}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view === "vars") {
    return (
      <div data-flow-vars>
        <p className="quiet">{T.vWhat}</p>
        <div className="panel"><div className="panel-face flow-scroll">
          <table className="readout flow-table">
            <thead><tr>{T.vcols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {r.variables.slice(0, 200).map((v) => (
                <tr key={v.addr} data-flow-var={hex4(v.addr)}>
                  <td className="num">${v.addr < 0x100 ? hex2(v.addr) : hex4(v.addr)}</td>
                  <td className="num">{v.writers.slice(0, 4).map(([i]) => name(i)).join(" ")}</td>
                  <td className="num">{v.readers.slice(0, 6).map(([i]) => name(i)).join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>
    );
  }

  return (
    <div data-flow-raw>
      <p className="quiet">{T.rawWhat}</p>
      <div className="chips">
        <label className="field"><span>{T.from}</span><input className="input" type="number" min={0} max={r.frames - 1} value={from} onChange={(e) => setFrom(Math.max(0, e.target.valueAsNumber | 0))} /></label>
        <label className="field"><span>{T.to}</span><input className="input" type="number" min={0} max={r.frames - 1} value={to} onChange={(e) => setTo(Math.max(0, e.target.valueAsNumber | 0))} /></label>
        <button type="button" className="btn" onClick={() => void flow.saveTrace(id, from, to)} data-flow-save-trace>{T.saveTrace}</button>
      </div>
      <p className="chips">
        <button type="button" className="btn btn-ghost" onClick={flow.downloadReport} data-flow-save-report>{T.saveReport}</button>
      </p>
    </div>
  );
}
