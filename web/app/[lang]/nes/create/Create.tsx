"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Lang } from "@/lib/lang";
import { Desk, Window, useDesk, type DeskLabels, type WinSpec } from "@/app/components/Desk";
import { Cartridge, Readouts, Screen } from "../play/Play";
import { State } from "../play/State";
import { Code } from "../play/Code";
import { Sprites } from "../play/Sprites";
import { Record } from "./Record";
import { Flow } from "./Flow";
import { Listing } from "./Listing";
import { Program } from "./Program";
import { History } from "./History";
import { Nametables } from "./Nametables";
import * as flow from "./flowEngine";
import * as program from "./programEngine";

/**
 * The create desk: the play page's console and every tool it has, each in
 * a window of its own (Desk.tsx has the mechanics). One engine drives them
 * all, the same module the play page uses, so every window is looking at
 * the one running machine.
 */

const WINS: WinSpec[] = [
  { id: "screen", at: [0, 0, 0.36, 0.56] },
  { id: "cartridge", at: [0, 0.56, 0.36, 0.44] },
  { id: "code", at: [0.36, 0, 0.32, 1] },
  { id: "cpu", at: [0.68, 0, 0.32, 0.3] },
  { id: "memory", at: [0.68, 0.3, 0.32, 0.4] },
  { id: "palettes", at: [0.06, 0.06, 0.4, 0.5], open: false },
  { id: "oam", at: [0.12, 0.1, 0.4, 0.6], open: false },
  { id: "nametables", at: [0.1, 0.06, 0.56, 0.7], open: false },
  { id: "sprites", at: [0.2, 0.04, 0.6, 0.9], open: false },
  { id: "readouts", at: [0.3, 0.3, 0.4, 0.4], open: false },
  // Record is open from the start, under the memory, so the way into the
  // flow tools is on the desk rather than in the tray (owner, 2026-09-27);
  // Flow opens over the screen and the code, beside Record rather than on it.
  { id: "record", at: [0.68, 0.7, 0.32, 0.3] },
  { id: "flow", at: [0, 0, 0.68, 1], open: false },
  // The listing opens where Flow does: the same run, as the file.
  { id: "listing", at: [0, 0, 0.68, 1], open: false },
  { id: "history", at: [0.36, 0.04, 0.5, 0.92], open: false },
  // A lesson's program to change opens over the code, beside the screen
  // and the cartridge, so what it builds is in view as it plays.
  { id: "program", at: [0.36, 0, 0.32, 1], open: false },
  { id: "about", at: [0.3, 0.16, 0.4, 0.6], open: false },
];

const LABELS: Record<Lang, DeskLabels> = {
  en: {
    tray: "Windows",
    tidy: "Tidy",
    tidyTitle: "Put every window back where it started",
    close: "Close",
    max: "Fill the desk",
    restore: "Back to its size",
    size: "Drag to size the window",
  },
  ja: {
    tray: "ウィンドウ",
    tidy: "整える",
    tidyTitle: "すべてのウィンドウを最初の位置に戻す",
    close: "閉じる",
    max: "机いっぱいに広げる",
    restore: "元の大きさに戻す",
    size: "ドラッグして大きさを変える",
  },
};

export function Create({ lang, about, more, lessons }: { lang: Lang; about: ReactNode; more: { href: string; label: string }[]; lessons: { key: string; title: string }[] }) {
  return (
    <Desk storageKey="tm.nes.create.desk" wins={WINS} labels={LABELS[lang]} className="play-shell" more={more}>
      <Windows lang={lang} about={about} lessons={lessons} />
    </Desk>
  );
}

function Windows({ lang, about, lessons }: { lang: Lang; about: ReactNode; lessons: { key: string; title: string }[] }) {
  const desk = useDesk();
  // A sprite on screen names its tile; the sheet opens it, and its window
  // comes forward.
  const [openTile, setOpenTile] = useState<{ tile: number; n: number } | null>(null);
  const onTile = (tile: number) => {
    setOpenTile((o) => ({ tile, n: (o?.n ?? 0) + 1 }));
    desk.show("sprites");
  };
  // A recording read or opened comes up in the Flow window, brought forward.
  const opened = useSyncExternalStore(flow.subscribe, () => flow.snapshot().open?.meta.id ?? null, () => null);
  const { show } = desk;
  // A lesson's program opened (from ?lesson= or the window's own choice)
  // comes up in the Program window, brought forward, the way Flow does.
  const programFor = useSyncExternalStore(program.subscribe, () => program.snapshot().parts?.key ?? null, () => null);
  useEffect(() => {
    if (opened) show("flow");
    // Only when another recording opens, not whenever the desk moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  useEffect(() => {
    if (programFor) show("program");
    // Only when another lesson's program opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programFor]);
  return (
    <>
      <Window id="screen"><Screen lang={lang} stage={desk.mode !== "float"} /></Window>
      <Window id="cartridge"><Cartridge lang={lang} /></Window>
      <Window id="code"><Code lang={lang} /></Window>
      <Window id="cpu"><State lang={lang} only={["cpu"]} /></Window>
      <Window id="memory"><State lang={lang} only={["memory"]} /></Window>
      <Window id="palettes"><State lang={lang} only={["palettes"]} /></Window>
      <Window id="oam"><State lang={lang} only={["oam"]} onTile={onTile} /></Window>
      <Window id="nametables"><Nametables lang={lang} /></Window>
      <Window id="sprites"><Sprites lang={lang} open={openTile} /></Window>
      <Window id="readouts"><Readouts lang={lang} /></Window>
      <Window id="record"><Record lang={lang} /></Window>
      <Window id="flow"><Flow lang={lang} /></Window>
      <Window id="listing"><Listing lang={lang} /></Window>
      <Window id="history"><History lang={lang} /></Window>
      <Window id="program"><Program lang={lang} lessons={lessons} /></Window>
      <Window id="about">{about}</Window>
    </>
  );
}
