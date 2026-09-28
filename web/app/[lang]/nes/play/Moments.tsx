"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { deleteMoment, listMoments, sha256, type MomentMeta } from "@/lib/flowStore";
import { loadMoment, saveMoment, serverSnapshot, snapshot, subscribe } from "./playEngine";

/**
 * Saved moments, under the cartridge on the play page and the create
 * desk: the whole console saved at one instant and put back exactly
 * there. The engine saves and loads (playEngine's saveMoment and
 * loadMoment); lib/flowStore keeps them per game in this browser.
 */

const S = {
  en: {
    h: "Saved moments",
    save: "Save this moment",
    saveTitle: "Saves the whole console as it is right now, so you can come back to exactly here",
    load: "Load",
    loadTitle: "Puts the game back exactly where this moment was saved",
    del: "Delete",
    empty: "No moments saved for this game yet.",
    at: (f: number) => `frame ${f}`,
    what: "A moment is the whole console at one instant: the chips, the memory, the cartridge's banks and its save. It stays in this browser, and loading it on any other game is refused.",
  },
  ja: {
    h: "保存した場面",
    save: "この場面を保存",
    saveTitle: "いまのコンソール全体を保存し、あとでちょうどここへ戻れるようにする",
    load: "読み込む",
    loadTitle: "この場面を保存した所へ、ゲームをそのまま戻す",
    del: "削除",
    empty: "このゲームで保存した場面はまだ無い。",
    at: (f: number) => `${f} フレーム目`,
    what: "場面とは、ある一瞬のコンソール全体のこと: チップ、メモリ、カートリッジのバンクとセーブ。このブラウザに残り、ほかのゲームで読み込もうとすると断られる。",
  },
} as const;

export function Moments({ lang }: { lang: Lang }) {
  const T = S[lang];
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  // Each answer names what it answers for, so one that arrives for another
  // game (or before a save) is not shown.
  const [hashed, setHashed] = useState<{ rom: Uint8Array; sha: string } | null>(null);
  const [listed, setListed] = useState<{ sha: string; kept: number; gone: number; list: MomentMeta[] } | null>(null);
  const [gone, setGone] = useState(0);
  const sha = hashed && hashed.rom === s.rom ? hashed.sha : null;

  useEffect(() => {
    const rom = s.rom;
    if (!rom) return;
    let live = true;
    void sha256(rom).then((h) => live && setHashed({ rom, sha: h }));
    return () => {
      live = false;
    };
  }, [s.rom]);

  useEffect(() => {
    if (!sha) return;
    let live = true;
    const kept = s.momentsKept;
    listMoments(sha)
      .catch(() => [] as MomentMeta[])
      .then((list) => live && setListed({ sha, kept, gone, list }));
    return () => {
      live = false;
    };
  }, [sha, s.momentsKept, gone]);

  const list = listed && listed.sha === sha && listed.kept === s.momentsKept && listed.gone === gone ? listed.list : null;

  if (!s.loaded) return null;
  const when = (iso: string) => new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "en-GB", { dateStyle: "medium", timeStyle: "medium" });

  return (
    <div className="play-moments" data-moments>
      <h3 className="eyebrow">{T.h}</h3>
      <p className="chips">
        <button type="button" className="btn" title={T.saveTitle} disabled={!s.powered} onClick={() => void saveMoment()} data-moment-save>
          {T.save}
        </button>
      </p>
      {list === null ? null : list.length === 0 ? (
        <p className="quiet" data-moments-empty>{T.empty}</p>
      ) : (
        <ul className="flow-recs">
          {list.map((m) => (
            <li key={m.id} data-moment-id={m.id}>
              <p className="chips">
                <span className="measured">{when(m.savedAt)}</span>
                <span className="measured">{T.at(m.frame)}</span>
                <button type="button" className="btn" title={T.loadTitle} disabled={!s.powered || !!s.recording} onClick={() => void loadMoment(m)} data-moment-load>
                  {T.load}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void deleteMoment(m.sha256, m.id).then(() => setGone((n) => n + 1))}
                  data-moment-delete
                >
                  {T.del}
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="quiet">{T.what}</p>
    </div>
  );
}
