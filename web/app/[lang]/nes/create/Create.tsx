"use client";

import { useState, type ReactNode } from "react";
import type { Lang } from "@/lib/lang";
import { Desk, Window, useDesk, type DeskLabels, type WinSpec } from "@/app/components/Desk";
import { Cartridge, Readouts, Screen } from "../play/Play";
import { State } from "../play/State";
import { Code } from "../play/Code";
import { Sprites } from "../play/Sprites";

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
  { id: "cpu", at: [0.68, 0, 0.32, 0.34] },
  { id: "memory", at: [0.68, 0.34, 0.32, 0.66] },
  { id: "palettes", at: [0.06, 0.06, 0.4, 0.5], open: false },
  { id: "oam", at: [0.12, 0.1, 0.4, 0.6], open: false },
  { id: "sprites", at: [0.2, 0.04, 0.6, 0.9], open: false },
  { id: "readouts", at: [0.3, 0.3, 0.4, 0.4], open: false },
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

export function Create({ lang, about, more }: { lang: Lang; about: ReactNode; more: { href: string; label: string }[] }) {
  return (
    <Desk storageKey="tm.nes.create.desk" wins={WINS} labels={LABELS[lang]} className="play-shell" more={more}>
      <Windows lang={lang} about={about} />
    </Desk>
  );
}

function Windows({ lang, about }: { lang: Lang; about: ReactNode }) {
  const desk = useDesk();
  // A sprite on screen names its tile; the sheet opens it, and its window
  // comes forward.
  const [openTile, setOpenTile] = useState<{ tile: number; n: number } | null>(null);
  const onTile = (tile: number) => {
    setOpenTile((o) => ({ tile, n: (o?.n ?? 0) + 1 }));
    desk.show("sprites");
  };
  return (
    <>
      <Window id="screen"><Screen lang={lang} stage={desk.mode !== "float"} /></Window>
      <Window id="cartridge"><Cartridge lang={lang} /></Window>
      <Window id="code"><Code lang={lang} /></Window>
      <Window id="cpu"><State lang={lang} only={["cpu"]} /></Window>
      <Window id="memory"><State lang={lang} only={["memory"]} /></Window>
      <Window id="palettes"><State lang={lang} only={["palettes"]} /></Window>
      <Window id="oam"><State lang={lang} only={["oam"]} onTile={onTile} /></Window>
      <Window id="sprites"><Sprites lang={lang} open={openTile} /></Window>
      <Window id="readouts"><Readouts lang={lang} /></Window>
      <Window id="about">{about}</Window>
    </>
  );
}
