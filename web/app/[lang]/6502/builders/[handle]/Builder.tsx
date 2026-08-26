"use client";

import Link from "next/link";
import { ChrArt } from "@/app/components/ChrArt";
import { RegistryState, useRegistry } from "@/app/components/RegistryData";
import { localize, type Lang } from "@/lib/lang";
import { day, type Builder as Doc, type Rom } from "@/lib/registry";

/**
 * One builder's page: who they are, and everything they publish.
 *
 * The cartridges carry their measurement rather than a description of it.
 * `measured` is what the registry recorded when it ran the ROM at publish
 * time, and it is on a panel because that is what a dark box means here:
 * these numbers came off the die. The rule from the 6502 work is that the
 * thing which publishes must not be the thing which claims, and this is the
 * reader's half of it. The evidence is on the page.
 */

const L = {
  en: {
    barLeft: "measured at publish",
    barRight: "on the die",
    booted: "booted",
    yes: "yes",
    no: "no",
    frames: "frames finished",
    of: "of",
    hc: "half-cycles a frame",
    screen: "screen changed",
    tilesUsed: "tiles used",
    cart: "cartridge",
    published: (n: number, d: string) => (
      <>
        <b>
          {n} {n === 1 ? "cartridge" : "cartridges"}
        </b>{" "}
        published, joined {d}
      </>
    ),
    whatPublished: "What they have published",
    romLine: (slug: string, size: number, tiles: number) => (
      <>
        {slug} &middot; {size} B of ROM, {tiles} tiles
      </>
    ),
    headlessLine: (slug: string, size: number) => (
      <>
        {slug} &middot; {size} B of ROM, draws nothing
      </>
    ),
    ran: "half-cycles run",
    pcMoved: "pc still moving at the end",
    registers: "registers after the run",
    peeked: "bytes read out",
    play: "play it",
    explore: "run it in the explorer",
    nothingYet: (h: string) => (
      <>
        <b>@{h}</b> has a page and has published nothing yet.
      </>
    ),
  },
  ja: {
    barLeft: "公開時に実測",
    barRight: "ダイ上で",
    booted: "ブート",
    yes: "はい",
    no: "いいえ",
    frames: "完了フレーム",
    of: "/",
    hc: "1 フレームの半サイクル",
    screen: "画面の変化",
    tilesUsed: "使用タイル",
    cart: "カートリッジ",
    published: (n: number, d: string) => (
      <>
        <b>カートリッジ {n} 本</b>を公開、参加 {d}
      </>
    ),
    whatPublished: "公開したもの",
    romLine: (slug: string, size: number, tiles: number) => (
      <>
        {slug} &middot; ROM {size} B、タイル {tiles} 枚
      </>
    ),
    headlessLine: (slug: string, size: number) => (
      <>
        {slug} &middot; ROM {size} B、何も描かない
      </>
    ),
    ran: "実行した半サイクル",
    pcMoved: "終了時に pc はまだ動いている",
    registers: "実行後のレジスタ",
    peeked: "読み出したバイト",
    play: "遊ぶ",
    explore: "エクスプローラで走らせる",
    nothingYet: (h: string) => (
      <>
        <b>@{h}</b> にはページがあり、まだ何も公開していない。
      </>
    ),
  },
} as const;

const hex = (v: number, n: number) => "$" + v.toString(16).toUpperCase().padStart(n, "0");

/** The publish-time run, shown rather than summarised. */
function Measured({ rom, lang }: { rom: Rom; lang: Lang }) {
  const T = L[lang];
  const m = rom.measured;
  if (m.kind === "headless") {
    // A run, not frames: how long, whether the pc was still moving at the
    // end (a loop or a finished program on one side, a JAM on the other),
    // the registers, and the bytes the cartridge asked to have read.
    const r = m.registers;
    return (
      <div className="panel">
        <div className="panel-bar">
          <span>{T.barLeft}</span>
          <span>{T.barRight}</span>
        </div>
        <div className="panel-face">
          <table className="readout">
            <tbody>
              <tr>
                <th>{T.booted}</th>
                <td className="num">{m.booted ? T.yes : T.no}</td>
              </tr>
              <tr>
                <th>{T.ran}</th>
                <td className="num">{m.half_cycles.join(", ")}</td>
              </tr>
              <tr>
                <th>{T.pcMoved}</th>
                <td className="num">{m.pc_moved ? T.yes : T.no}</td>
              </tr>
              {r ? (
                <tr>
                  <th>{T.registers}</th>
                  <td className="num">
                    PC {hex(r.pc, 4)} A {hex(r.a, 2)} X {hex(r.x, 2)} Y {hex(r.y, 2)} S {hex(r.s, 2)} P {hex(r.p, 2)}
                    {m.flags ? <> {m.flags}</> : null}
                  </td>
                </tr>
              ) : null}
              {m.peeked && Object.keys(m.peeked).length ? (
                <tr>
                  <th>{T.peeked}</th>
                  <td className="num">
                    {Object.entries(m.peeked).map(([k, v]) => `${k} ${hex(v, 2)}`).join(" · ")}
                  </td>
                </tr>
              ) : null}
              <tr>
                <th>{T.cart}</th>
                <td className="num">{rom.bytes} B</td>
              </tr>
              <tr>
                <th>sha256</th>
                <td className="num">{rom.sha256.slice(0, 16)}</td>
              </tr>
            </tbody>
          </table>
          {m.notes.length ? <p className="reg-note">{m.notes.join(" ")}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-bar">
        <span>{T.barLeft}</span>
        <span>{T.barRight}</span>
      </div>
      <div className="panel-face">
        <table className="readout">
          <tbody>
            <tr>
              <th>{T.booted}</th>
              <td className="num">{m.booted ? T.yes : T.no}</td>
            </tr>
            <tr>
              <th>{T.frames}</th>
              <td className="num">
                {m.frames_completed} {T.of} {m.frames_requested}
              </td>
            </tr>
            <tr>
              <th>{T.hc}</th>
              <td className="num">{m.half_cycles.join(", ")}</td>
            </tr>
            <tr>
              <th>{T.screen}</th>
              <td className="num">{m.screen_changed ? T.yes : T.no}</td>
            </tr>
            <tr>
              <th>{T.tilesUsed}</th>
              <td className="num">
                {m.tiles_used.length} {T.of} {rom.tiles}
              </td>
            </tr>
            <tr>
              <th>{T.cart}</th>
              <td className="num">{rom.bytes} B</td>
            </tr>
            <tr>
              {/* Lowercase, and in the readout rather than in the title bar.
                  .panel-bar uppercases its text, and a SHA-256 is a value:
                  half of it rendered in capitals is not the digest that was
                  recorded, it is a different string that compares equal only
                  if you know to fold the case first. */}
              <th>sha256</th>
              <td className="num">{rom.sha256.slice(0, 16)}</td>
            </tr>
          </tbody>
        </table>
        {m.notes.length ? (
          <p className="reg-note">{m.notes.join(" ")}</p>
        ) : null}
      </div>
    </div>
  );
}

export function Builder({
  handle,
  api,
  lang = "en",
}: {
  handle: string;
  api: string;
  lang?: Lang;
}) {
  const T = L[lang];
  const { data, error } = useRegistry<Doc>(
    `${api}/v1/registry/b/${encodeURIComponent(handle)}`,
  );

  if (!data) return <RegistryState error={error} what={`@${handle}`} lang={lang} />;

  return (
    <>
      <div className="reg-face">
        {data.avatar ? (
          <ChrArt art={data.avatar} api={api} alt={`${data.name}'s avatar`} />
        ) : null}
        <div className="who">
          <h2>{data.name}</h2>
          <p className="handle">@{data.handle}</p>
          <p>{data.bio}</p>
          <p className="chips">
            <span className="measured">{T.published(data.roms.length, day(data.created))}</span>
            {data.links.map((l) => (
              <a key={l.url} className="tag" data-address href={l.url} rel="nofollow ugc noopener">
                {l.label}
              </a>
            ))}
          </p>
        </div>
      </div>

      <h2>{T.whatPublished}</h2>
      {data.roms.length ? (
        <div className="reg-grid">
          {data.roms.map((rom) => (
            <article key={rom.slug} className="rail reg-card">
              {rom.cover ? (
                <div className="reg-cover">
                  <ChrArt art={rom.cover} api={api} alt={`Cover art for ${rom.title}`} />
                </div>
              ) : null}
              <div>
                <h3>{rom.title}</h3>
                <span className="handle">{rom.kind === "headless" ? T.headlessLine(rom.slug, rom.rom_size) : T.romLine(rom.slug, rom.rom_size, rom.tiles)}</span>
              </div>
              <p>{rom.blurb}</p>
              <Measured rom={rom} lang={lang} />
              <p className="chips">
                <Link
                  className="tag live"
                  href={`${localize(lang, "/6502/games")}?cart=${encodeURIComponent(api + rom.cart_url)}`}
                >
                  {T.play}
                </Link>
                <a className="tag" data-address href={`${api}${rom.cart_url}`}>
                  .cart.gz
                </a>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="reg-state">{T.nothingYet(data.handle)}</p>
      )}
    </>
  );
}
