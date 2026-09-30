"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import * as flow from "./flowEngine";
import * as listing from "./listingEngine";

/**
 * The Listing window: the open recording's cartridge as assemblable text
 * with the run laid over it (wasm/listing, FORMAT.md), read here through
 * the game model its marks describe: how much of the PRG the run
 * executed, which patterns the matchers named, every routine the run
 * entered, and any routine's lines as the listing has them. Nothing here
 * is typed; every figure is a mark in the file.
 */

const S = {
  en: {
    h: "Listing",
    none: "Nothing open. Read a recording in the Record window, then write its listing here.",
    write: "Write the listing",
    rewrite: "Write it again",
    writing: "Writing the listing...",
    of: (name: string) => <>the run of <b>{name}</b></>,
    coverage: (executed: number, of: number, frames: number) => (
      <>The run executed <b>{executed.toLocaleString("en")}</b> of the <b>{of.toLocaleString("en")}</b> bytes of program over <b>{frames.toLocaleString("en")}</b> frames.</>
    ),
    patterns: "What the matchers named, from what the run did",
    noPatterns: "no pattern matched",
    routines: "Every place the run entered, with its patterns",
    cols: ["name", "entered", "times", "patterns"],
    kinds: { reset: "power-on", nmi: "each frame (NMI)", irq: "IRQ", brk: "BRK", call: "call", dispatch: "table" } as Record<string, string>,
    inside: "inside another instruction",
    lines: "Its lines, as the listing has them",
    more: (n: number) => `and ${n} more`,
    listing: "Download the listing",
    model: "Download the model (JSON)",
    check: "The listing assembles back to the cartridge byte for byte; the file's tools check it.",
  },
  ja: {
    h: "リスティング",
    none: "開いているものは無い。記録のウィンドウで記録を読んでから、ここでリスティングを書く。",
    write: "リスティングを書く",
    rewrite: "書き直す",
    writing: "リスティングを書いている...",
    of: (name: string) => <><b>{name}</b> の走行</>,
    coverage: (executed: number, of: number, frames: number) => (
      <>走行はプログラム <b>{of.toLocaleString("ja")}</b> バイトのうち <b>{executed.toLocaleString("ja")}</b> バイトを、<b>{frames.toLocaleString("ja")}</b> フレームで実行した。</>
    ),
    patterns: "走行の振る舞いからマッチャーが名付けたもの",
    noPatterns: "一致したパターンは無い",
    routines: "走行が入った場所のすべてと、そのパターン",
    cols: ["名前", "入り方", "回数", "パターン"],
    kinds: { reset: "電源投入", nmi: "毎フレーム（NMI）", irq: "IRQ", brk: "BRK", call: "呼び出し", dispatch: "テーブル" } as Record<string, string>,
    inside: "別の命令の内側",
    lines: "リスティングにある行",
    more: (n: number) => `ほか ${n} 個`,
    listing: "リスティングをダウンロード",
    model: "モデルをダウンロード（JSON）",
    check: "リスティングはカートリッジへ一バイトも違わず組み立て直せる。ファイルのツールがそれを検査する。",
  },
} as const;

const LABEL = /^\s+([A-Za-z_][A-Za-z0-9_]*):$/;

/** A routine's lines out of the rendered listing: the marks before its label, the label, then up to the next label. */
function linesOf(rendered: string, name: string): string[] {
  const all = rendered.split("\n");
  const at = all.findIndex((l) => LABEL.exec(l)?.[1] === name);
  if (at < 0) return [];
  let from = at;
  while (from > 0 && (all[from - 1].trim().startsWith(";; @") || all[from - 1].trim() === "")) from -= 1;
  let to = at + 1;
  while (to < all.length && !LABEL.test(all[to]) && to - from < 400) to += 1;
  return all.slice(from, to);
}

export function Listing({ lang }: { lang: Lang }) {
  const T = S[lang];
  const f = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.serverSnapshot);
  const l = useSyncExternalStore(listing.subscribe, listing.snapshot, listing.serverSnapshot);
  const [pick, setPick] = useState<string | null>(null);
  const o = f.open;
  const out = l.out && o && l.out.meta.id === o.meta.id ? l.out : null;
  const routines = useMemo(() => (out ? out.model.routines.filter((r) => r.by === "run") : []), [out]);
  const patterns = useMemo(() => (out ? Object.entries(out.model.patterns).sort() : []), [out]);
  const picked = useMemo(() => (out && pick ? linesOf(out.rendered, pick) : []), [out, pick]);
  const shown = routines.slice(0, 300);
  return (
    <section className="wb-page play-section" id="listing" data-listing data-listing-for={out ? out.meta.id : ""}>
      <h2 className="eyebrow">{T.h}</h2>
      {!o ? (
        <p className="quiet" data-listing-none>{T.none}</p>
      ) : (
        <>
          <p className="quiet">
            {T.of(o.meta.name)}{" "}
            <button type="button" className="btn" disabled={l.busy} onClick={() => void listing.build(o.meta.id)} data-listing-build>{out ? T.rewrite : T.write}</button>
          </p>
          {l.busy ? <p className="quiet" data-listing-busy>{T.writing}</p> : null}
          {l.why ? <p className="quiet" data-listing-why>{l.why}</p> : null}
          {out ? (
            <>
              <p data-listing-coverage>{T.coverage(out.model.run?.executed ?? 0, out.model.run?.of ?? out.model.prg, out.model.run?.frames ?? 0)}</p>
              <p className="quiet">{T.patterns}</p>
              <div className="chips" data-listing-patterns>
                {patterns.length ? patterns.map(([p, n]) => <span key={p} className="chip" data-listing-pattern={p}>{p} {n}</span>) : <span className="quiet">{T.noPatterns}</span>}
              </div>
              <p className="quiet">{T.routines}</p>
              <div className="panel"><div className="panel-face flow-scroll">
                <table className="readout flow-table" data-listing-routines>
                  <thead><tr>{T.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={`${r.bank}:${r.addr}:${r.name}`} onClick={() => setPick(r.inside === undefined ? r.name : null)} aria-selected={pick === r.name || undefined} className={pick === r.name ? "picked" : undefined} data-listing-routine={r.name}>
                        <td className="num">{r.name}</td>
                        <td>{T.kinds[r.kind] ?? r.kind}{r.inside !== undefined ? ` (${T.inside})` : ""}</td>
                        <td className="num">{r.entered ?? ""}</td>
                        <td>{r.is.map((i) => i.pattern).join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
              {routines.length > shown.length ? <p className="quiet">{T.more(routines.length - shown.length)}</p> : null}
              {pick && picked.length ? (
                <>
                  <p className="quiet">{T.lines}</p>
                  <div className="panel"><div className="panel-face flow-scroll"><pre className="readout" data-listing-lines>{picked.join("\n")}</pre></div></div>
                </>
              ) : null}
              <p className="quiet">
                <button type="button" className="btn btn-ghost" onClick={() => listing.downloadListing()} data-listing-download>{T.listing}</button>{" "}
                <button type="button" className="btn btn-ghost" onClick={() => listing.downloadModel()} data-listing-download-model>{T.model}</button>
              </p>
              <p className="quiet">{T.check}</p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
