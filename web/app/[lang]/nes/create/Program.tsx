"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import type { JumpMeasures } from "@/lib/lessons";
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
    notMeasured: (why: string) => `測れなかった: ${why}。`,
  },
} as const;

type Row = { key: string; label: string; ours: number; yours: number; oursText: string; yoursText: string };

/** Our numbers and the reader's, a row a number. A jump of theirs that ours has no match for is not listed. */
function rows(T: (typeof S)[Lang], ours: JumpMeasures, yours: JumpMeasures, n: (v: number) => string): Row[] {
  const row = (key: string, label: string, a: number, b: number): Row => ({ key, label, ours: a, yours: b, oursText: n(a), yoursText: n(b) });
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
              ) : !p.measured.yours ? (
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
                        {rows(T, p.parts.measure.ours, p.measured.yours, n).map((r) => (
                          <tr key={r.key} data-program-measure={r.key} data-ours={r.ours} data-yours={r.yours} data-same={String(r.ours === r.yours)}>
                            <th scope="row">{r.label}</th>
                            <td>{r.oursText}</td>
                            <td>{r.ours === r.yours ? r.yoursText : <b>{r.yoursText}</b>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
