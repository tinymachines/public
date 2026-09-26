"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { ShelfPicker } from "@/app/components/ShelfPicker";
import * as play from "../play/playEngine";
import * as flow from "./flowEngine";

/**
 * The Record window: a recording from power-on of what the reader pressed
 * and when (the console's input log, with a digest of every picture), the
 * recordings kept in this browser, and the key that plays one back through
 * the flow tools. flowEngine.ts and lib/flowStore.ts hold the mechanics.
 */

const S = {
  en: {
    h: "Record",
    what: "A recording keeps every button you press and when, from power-on. Played back, it makes the same game again to the dot, and the flow tools read that playback: every instruction the game ran, what it read and wrote, and when.",
    none: "Load a cartridge to record it.",
    start: "Record from power-on",
    startTitle: "Starts the cartridge again from power-on (its save goes back first) and records from there",
    stop: "Stop and keep",
    live: (f: number) => <>recording, <b>{f}</b> {f === 1 ? "frame" : "frames"} so far</>,
    listH: "Recordings in this browser",
    empty: "No recordings yet.",
    frames: (f: number) => `${f} frames, ${(f / 60.0988).toFixed(1)} s`,
    patched: "patched",
    save: "with a save",
    read: "Read it",
    readTitle: "Plays the recording back and reads every instruction it ran",
    reread: "Read it again",
    open: "Open",
    export: "Export",
    del: "Delete",
    noRom: "The game is not in this browser:",
    giveRom: "load it",
    playing: (c: number, f: number) => <>playing back, <b>{c}</b> of <b>{f}</b> frames</>,
    reading: "reading",
    cancel: "Stop",
    import: "Import a recording",
    stays: "Recordings stay in this browser, in its own private storage, and nothing is sent anywhere. An exported recording holds the buttons and the save but never the game, so playing it back somewhere else needs the same cartridge there. Leaving the page while recording loses the recording.",
  },
  ja: {
    h: "記録",
    what: "記録は、電源を入れた時から押したボタンとその時刻をすべて残す。再生すると同じゲームがドット単位でもう一度走り、フローの道具はその再生を読む: ゲームが実行したすべての命令、何を読み何を書いたか、そしていつか。",
    none: "記録するにはカートリッジを読み込む。",
    start: "電源投入から記録",
    startTitle: "カートリッジを電源投入からやり直し（セーブを先に戻す）、そこから記録する",
    stop: "止めて残す",
    live: (f: number) => <>記録中、ここまで <b>{f}</b> フレーム</>,
    listH: "このブラウザにある記録",
    empty: "記録はまだ無い。",
    frames: (f: number) => `${f} フレーム、${(f / 60.0988).toFixed(1)} 秒`,
    patched: "パッチ済み",
    save: "セーブ付き",
    read: "読む",
    readTitle: "記録を再生し、実行されたすべての命令を読む",
    reread: "もう一度読む",
    open: "開く",
    export: "書き出す",
    del: "削除",
    noRom: "このブラウザにゲームが無い:",
    giveRom: "読み込む",
    playing: (c: number, f: number) => <>再生中、<b>{f}</b> フレーム中 <b>{c}</b></>,
    reading: "読んでいる",
    cancel: "止める",
    import: "記録を読み込む",
    stays: "記録はこのブラウザ専用の保存領域に残り、どこへも送られない。書き出した記録にはボタンとセーブが入るがゲームは入らないので、別の場所で再生するにはそこにも同じカートリッジが要る。記録中にページを離れると、その記録は失われる。",
  },
} as const;

export function Record({ lang }: { lang: Lang }) {
  const T = S[lang];
  const p = useSyncExternalStore(play.subscribe, play.snapshot, play.serverSnapshot);
  const f = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.serverSnapshot);
  useEffect(() => {
    void flow.refresh();
  }, [p.recordingsKept]);
  const when = (iso: string) => new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="wb-page play-section" id="record" data-record data-recording={p.recording ? "on" : "off"}>
      <h2 className="eyebrow">{T.h}</h2>
      <p className="quiet">{T.what}</p>
      {!p.loaded ? (
        <p className="quiet" data-record-why>{T.none}</p>
      ) : p.recording ? (
        <div className="chips">
          <button type="button" className="btn btn-primary" onClick={() => void play.stopRecording()} data-record-stop>{T.stop}</button>
          <span className="measured" data-record-frames={p.framesRun}>{T.live(p.framesRun)}</span>
        </div>
      ) : (
        <div className="chips">
          <button type="button" className="btn btn-primary" title={T.startTitle} disabled={!!f.busy} onClick={() => void play.startRecording()} data-record-start>{T.start}</button>
        </div>
      )}

      <h3 className="eyebrow">{T.listH}</h3>
      {f.list === null ? null : f.list.length === 0 ? (
        <p className="quiet" data-record-empty>{T.empty}</p>
      ) : (
        <ul className="flow-recs">
          {f.list.map((r) => {
            const busy = f.busy?.id === r.id ? f.busy : null;
            return (
              <li key={r.id} data-recording-id={r.id} aria-current={f.open?.meta.id === r.id ? "true" : undefined}>
                <p className="flow-rec-h">
                  <b>{r.name}</b> <span className="quiet">{when(r.recordedAt)}</span>
                </p>
                <p className="chips">
                  <span className="measured">{T.frames(r.frames)}</span>
                  {r.patched ? <span className="tag">{T.patched}</span> : null}
                  {r.battery ? <span className="tag">{T.save}</span> : null}
                </p>
                {busy ? (
                  <p className="chips">
                    <progress max={busy.frames || 1} value={busy.checked} />
                    <span className="measured" data-record-progress>{T.playing(busy.checked, busy.frames)}</span>
                    <button type="button" className="btn btn-ghost" onClick={flow.cancel}>{T.cancel}</button>
                  </p>
                ) : (
                  <p className="chips">
                    {r.rom ? (
                      <button type="button" className="btn" title={T.readTitle} disabled={!!f.busy} onClick={() => void flow.analyze(r.id)} data-record-read>{r.report ? T.reread : T.read}</button>
                    ) : (
                      <>
                        <label className="btn btn-ghost">
                          {T.noRom} {T.giveRom}
                          <input type="file" accept=".nes" hidden onChange={(e) => e.target.files?.[0] && void flow.giveRom(r, e.target.files[0])} />
                        </label>
                        <ShelfPicker lang={lang} onPick={(file) => void flow.giveRom(r, file)} />
                      </>
                    )}
                    {r.report ? <button type="button" className="btn" onClick={() => void flow.open(r.id)} data-record-open>{T.open}</button> : null}
                    <button type="button" className="btn btn-ghost" onClick={() => void flow.exportOne(r)}>{T.export}</button>
                    <button type="button" className="btn btn-ghost" disabled={!!f.busy} onClick={() => void flow.remove(r.id)} data-record-delete>{T.del}</button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="chips">
        <label className="btn btn-ghost">
          {T.import}
          <input type="file" accept=".nesrec" hidden onChange={(e) => e.target.files?.[0] && void flow.importOne(e.target.files[0])} />
        </label>
      </p>
      {f.why ? <p className="flow-why" data-flow-why>{f.why}</p> : null}
      <p className="quiet">{T.stays}</p>
    </section>
  );
}
