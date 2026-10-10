"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/lang";
import { drawSquareFrom, fitColours, replaceTiles, setSpriteColours, shrink, tileCount, tileLines, toTiles, type Picture, type Rgb } from "@/lib/nesSprite";
import { measuredPalette, serverSnapshot as consoleServer, snapshot as consoleNow, subscribe as consoleSub } from "../play/playEngine";
import * as program from "./programEngine";
import { generateSprite, listSprites, signedIn, spriteUrl, type GeneratedSprite } from "./spriteApi";

/**
 * The Sprite maker: a picture made into NES sprite tiles. The picture is
 * one the sprite generator made (tinymachines.ai/sprites, for signed-in
 * users), a new one asked of it, or a PNG from this computer. It is
 * cropped, shrunk to 8, 16 or 32 pixels and fitted to three of the
 * console's colours as the picture worker measured them (lib/nesSprite.ts),
 * then offered as tiles: to download, to copy as lines of a program's
 * tiles, or to put into the program open in the Program window. Putting
 * them in edits the reader's copy of the program as well: the three
 * colours go into its sprite palette and its square is drawn from the new
 * tiles, and where the program has no such table or no such square the
 * note says so. The lesson's own cartridge is never changed.
 */

const S = {
  en: {
    h: "Sprite maker",
    intro: "A picture made into NES sprite tiles: three of the console's colours and see-through.",
    signIn: "Sign in to use the sprite generator; a picture from this computer works without it.",
    signInLink: "Sign in",
    yours: "Made by the generator",
    none: "None yet.",
    ask: "Describe a sprite",
    make: "Make it",
    making: "Making it... the first one after a restart takes a few minutes.",
    file: "Or a PNG from this computer",
    size: "Size",
    colours: "Colours, as codes for the sprite palette:",
    noPalette: "The console's colours are not measured yet; play any cartridge once.",
    download: "Download the tiles",
    copy: "Copy as tile lines",
    copied: "Copied.",
    put: "Put into the program's tiles from tile",
    put2: "Put them in",
    putDone: (a: string, b: string) => `In: tiles ${a === b ? a : `${a} to ${b}`}.`,
    coloursIn: (c: string) => `Its three colours are in the program's sprite palette: ${c}.`,
    coloursNo: "This program has no colour table the maker can find, so its palette is as it was.",
    drawOne: "The program's square is drawn from the new tile, four times over.",
    drawFour: "The program's square is drawn from the four new tiles.",
    drawMany: "Sixteen tiles are more than the square's four, so the program still draws what it drew; it needs a bigger draw to show them.",
    drawNo: "This program draws no square the maker can find, so nothing on the screen uses the new tiles yet.",
    play: "Assemble and play to see it.",
    noProgram: "Open a lesson in the Program window to put the tiles into it.",
    original: "the picture",
    nes: "as the NES draws it",
  },
  ja: {
    h: "スプライト作り",
    intro: "絵を NES のスプライトのタイルにする: コンソールの三色と透明。",
    signIn: "スプライトの生成器を使うにはサインインする。このコンピューターの絵ならサインインなしで使える。",
    signInLink: "サインイン",
    yours: "生成器が作ったもの",
    none: "まだ無い。",
    ask: "スプライトを言葉で",
    make: "作る",
    making: "作っている... 再起動のあとの最初の一つは数分かかる。",
    file: "またはこのコンピューターの PNG",
    size: "大きさ",
    colours: "色。スプライトのパレットに書く番号で:",
    noPalette: "コンソールの色がまだ測られていない。どれかのカートリッジを一度遊ぶ。",
    download: "タイルをダウンロード",
    copy: "タイルの行としてコピー",
    copied: "コピーした。",
    put: "プログラムのタイルに入れる。始めのタイル",
    put2: "入れる",
    putDone: (a: string, b: string) => `入れた: タイル ${a === b ? a : `${a}～${b}`}。`,
    coloursIn: (c: string) => `三色はプログラムのスプライトのパレットに書いた: ${c}。`,
    coloursNo: "このプログラムには作り手が見つけられる色の表が無いので、パレットは元のまま。",
    drawOne: "プログラムの四角は、新しいタイルを四回並べて描く。",
    drawFour: "プログラムの四角は、新しい四つのタイルで描く。",
    drawMany: "十六のタイルは四角の四つより多いので、プログラムは今までどおりに描く。見せるにはもっと大きく描く必要がある。",
    drawNo: "このプログラムには作り手が見つけられる四角が無いので、画面で新しいタイルを使うものはまだ無い。",
    play: "組み立てて遊ぶと見える。",
    noProgram: "プログラムのウィンドウでレッスンを開くと、そこへタイルを入れられる。",
    original: "元の絵",
    nes: "NES が描くと",
  },
} as const;

const hex = (n: number) => "$" + n.toString(16).toUpperCase().padStart(2, "0");

async function pictureOf(src: Blob | string): Promise<Picture> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

export function SpriteMaker({ lang }: { lang: Lang }) {
  const T = S[lang];
  const p = useSyncExternalStore(program.subscribe, program.snapshot, program.serverSnapshot);
  const [signed, setSigned] = useState<boolean | null>(null);
  const [sprites, setSprites] = useState<GeneratedSprite[]>([]);
  const [picture, setPicture] = useState<{ pic: Picture; url: string; name: string } | null>(null);
  // The measured colours: the console's own copy once anything has been
  // painted, or asked for when a picture is chosen.
  const painted = useSyncExternalStore(consoleSub, () => consoleNow().palette, () => consoleServer().palette);
  const [asked, setAsked] = useState<Rgb[] | null>(null);
  const palette = (painted as Rgb[] | null) ?? asked;
  const [size, setSize] = useState(16);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Where the tiles go: after the lesson's own until the reader says otherwise.
  const [chosen, setChosen] = useState<{ key: string; first: number } | null>(null);
  const free = Math.min(255, tileCount(p.parts?.chr ?? ""));
  const first = chosen && chosen.key === p.parts?.key ? chosen.first : free;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void signedIn().then(async (ok) => {
      setSigned(ok);
      if (ok) setSprites(await listSprites().catch(() => []));
    });
  }, []);

  const made = useMemo(() => {
    if (!picture || !palette) return null;
    const s = shrink(picture.pic, size);
    const f = fitColours(s, palette);
    const tiles = toTiles(f.indices, size);
    return { ...f, tiles, lines: tileLines(tiles) };
  }, [picture, palette, size]);

  // The NES version, eight screen pixels to a sprite pixel.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !made || !palette) return;
    const z = Math.floor(128 / size);
    c.width = c.height = size * z;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    made.indices.forEach((v, i) => {
      if (!v) return;
      const [r, gg, b] = palette[made.codes[v - 1]];
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect((i % size) * z, Math.floor(i / size) * z, z, z);
    });
  }, [made, palette, size]);

  const choose = async (src: Blob | string, name: string, url: string) => {
    setWhy(null);
    setNote(null);
    if (!palette) void measuredPalette().then((rgb) => setAsked(rgb as Rgb[] | null)).catch(() => undefined);
    try {
      setPicture({ pic: await pictureOf(src), url, name });
    } catch (e) {
      setWhy(String((e as Error).message ?? e));
    }
  };

  const make = async () => {
    setBusy(true);
    setWhy(null);
    try {
      const s = await generateSprite(prompt);
      setSprites(await listSprites().catch(() => [s]));
      await choose(spriteUrl(s.filename), s.filename, spriteUrl(s.filename));
    } catch (e) {
      setWhy(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!made || !picture) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(made.tiles)], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${picture.name.replace(/\.[a-z]+$/i, "")}-${size}.chr`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const put = () => {
    if (!made || !p.parts) return;
    program.setTiles(replaceTiles(p.chr, first, made.lines));
    const last = first + made.lines.length - 1;
    const said: string[] = [T.putDone(String(first), String(last))];
    let text = p.text;
    const coloured = setSpriteColours(text, made.codes);
    if (coloured !== null) text = coloured;
    said.push(coloured !== null ? T.coloursIn(made.codes.map(hex).join(", ")) : T.coloursNo);
    if (made.lines.length > 4) said.push(T.drawMany);
    else {
      const n = made.lines.length;
      const drawn = drawSquareFrom(text, n === 4 ? [first, first + 1, first + 2, first + 3] : [first, first, first, first]);
      if (drawn !== null) text = drawn;
      said.push(drawn === null ? T.drawNo : n === 4 ? T.drawFour : T.drawOne);
    }
    if (text !== p.text) program.edit(text);
    said.push(T.play);
    setNote(said.join(" "));
  };

  return (
    <section className="wb-page play-section" id="maker" data-maker>
      <h2 className="eyebrow">{T.h}</h2>
      <p className="quiet">{T.intro}</p>
      {signed === false ? (
        <p className="quiet" data-maker-signin>
          {T.signIn} <a href={`/api/v1/auth/github?next=${encodeURIComponent("/nes/create")}`}>{T.signInLink}</a>
        </p>
      ) : null}
      {signed ? (
        <>
          <p className="quiet">{T.yours}</p>
          <div className="chips" data-maker-sprites style={{ flexWrap: "wrap" }}>
            {sprites.length ? (
              sprites.map((s) => (
                <button key={s.filename} type="button" className="btn btn-ghost" onClick={() => void choose(spriteUrl(s.filename), s.filename, spriteUrl(s.filename))} title={s.filename}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a generated sprite, served by /sprites/view */}
                  <img src={spriteUrl(s.filename)} alt={s.filename} width={40} height={40} style={{ imageRendering: "pixelated" }} />
                </button>
              ))
            ) : (
              <span className="quiet">{T.none}</span>
            )}
          </div>
          <p className="quiet">
            <label>
              {T.ask}{" "}
              <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy} style={{ maxWidth: "100%" }} data-maker-prompt />
            </label>{" "}
            <button type="button" className="btn" disabled={busy || !prompt.trim()} onClick={() => void make()} data-maker-make>
              {T.make}
            </button>
          </p>
          {busy ? <p className="quiet">{T.making}</p> : null}
        </>
      ) : null}
      <p className="quiet">
        <label>
          {T.file}{" "}
          <input type="file" accept="image/png" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void choose(f, f.name, URL.createObjectURL(f));
          }} data-maker-file />
        </label>
      </p>
      <p className="quiet">
        {T.size}{" "}
        {[8, 16, 32].map((n) => (
          <button key={n} type="button" className={n === size ? "btn" : "btn btn-ghost"} aria-pressed={n === size} onClick={() => setSize(n)} data-maker-size={n}>
            {n}
          </button>
        ))}
      </p>
      {why ? <p className="notice fail" data-maker-why>{why}</p> : null}
      {picture ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the chosen picture */}
            <img src={picture.url} alt={T.original} width={128} height={128} style={{ objectFit: "contain" }} />
            <figcaption className="quiet">{T.original}</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <canvas ref={canvas} width={128} height={128} style={{ imageRendering: "pixelated" }} data-maker-nes />
            <figcaption className="quiet">{T.nes}</figcaption>
          </figure>
        </div>
      ) : null}
      {picture && !palette ? <p className="quiet">{T.noPalette}</p> : null}
      {made ? (
        <>
          <p data-maker-codes={made.codes.map(hex).join(",")}>
            {T.colours} <code>{made.codes.map(hex).join(", ")}</code>
          </p>
          <p className="quiet">
            <button type="button" className="btn btn-ghost" onClick={download} data-maker-download>{T.download}</button>{" "}
            <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard?.writeText(made.lines.join("\n")).then(() => setNote(T.copied))} data-maker-copy>{T.copy}</button>
          </p>
          {p.parts ? (
            <p className="quiet">
              <label>
                {T.put}{" "}
                <input type="number" min={0} max={255} value={first} onChange={(e) => setChosen({ key: p.parts!.key, first: Math.max(0, Math.min(255, Number(e.target.value) || 0)) })} style={{ width: "5em" }} data-maker-first />
              </label>{" "}
              <button type="button" className="btn" onClick={put} data-maker-put>{T.put2}</button>
            </p>
          ) : (
            <p className="quiet">{T.noProgram}</p>
          )}
          {note ? <p className="quiet" data-maker-note>{note}</p> : null}
        </>
      ) : null}
    </section>
  );
}
