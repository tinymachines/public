"use client";

import Link from "next/link";
import { ChrArt } from "@/app/components/ChrArt";
import { RegistryState, useRegistry } from "@/app/components/RegistryData";
import { localize, type Lang } from "@/lib/lang";
import { day, type Index, type Rom } from "@/lib/registry";

/**
 * Everyone with a page, and the most recently published cartridges.
 *
 * One request: `GET /v1/registry` already carries the builders, a `latest`
 * slice and the limits. Asking twice would be two documents that can disagree
 * about how many cartridges exist.
 *
 * Live rather than prerendered, and that is the honest arrangement rather than
 * a limitation. What somebody published five minutes ago is not a fact this
 * site's last build could have known, and a page that baked it would be a
 * page that is wrong between deploys with nothing to say so.
 */

const L = {
  en: {
    by: (h: string) => `by ${h}`,
    rom: "ROM",
    tiles: "Tiles",
    hcFrame: "Half-cycles a frame",
    notMeasured: "not measured",
    published: "Published",
    play: "play it",
    builders: (n: number) => (
      <>
        <b>
          {n} {n === 1 ? "builder" : "builders"}
        </b>{" "}
        counted by the registry when this page loaded
      </>
    ),
    carts: (n: number) => (
      <>
        <b>
          {n} {n === 1 ? "cartridge" : "cartridges"}
        </b>{" "}
        published, each one re-run on the die before it was listed
      </>
    ),
    limits: (r: number, kb: number) => (
      <>
        <b>{r} cartridges a builder</b> and {kb} KB each, read from the
        registry&rsquo;s own limits rather than from anything written here
      </>
    ),
    recent: "Recently published",
    nothing: "Nothing has been published yet.",
    buildersTitle: "Builders",
    nobody: "Nobody has claimed a handle yet.",
    cartCount: (n: number) => `${n} ${n === 1 ? "cartridge" : "cartridges"}`,
    theirPage: "their page",
    what: "the builders",
  },
  ja: {
    by: (h: string) => `作: ${h}`,
    rom: "ROM",
    tiles: "タイル",
    hcFrame: "1 フレームの半サイクル",
    notMeasured: "未計測",
    published: "公開日",
    play: "遊ぶ",
    builders: (n: number) => (
      <>
        <b>ビルダー {n} 人</b> このページ読み込み時にレジストリが数えた値
      </>
    ),
    carts: (n: number) => (
      <>
        <b>カートリッジ {n} 本</b> が公開済み。どれも掲載前にダイ上で
        走らせ直された
      </>
    ),
    limits: (r: number, kb: number) => (
      <>
        <b>1 ビルダーあたり {r} 本</b>、各 {kb} KB。ここに書かれた値ではなく
        レジストリ自身の上限から読み取り
      </>
    ),
    recent: "新着",
    nothing: "まだ何も公開されていない。",
    buildersTitle: "ビルダー",
    nobody: "まだ誰もハンドルを取得していない。",
    cartCount: (n: number) => `カートリッジ ${n} 本`,
    theirPage: "そのページへ",
    what: "ビルダー一覧",
  },
} as const;

export function CartCard({ rom, api, lang = "en" }: { rom: Rom; api: string; lang?: Lang }) {
  const T = L[lang];
  return (
    <article className="rail reg-card">
      {rom.cover ? (
        <div className="reg-cover">
          <ChrArt art={rom.cover} api={api} alt={`Cover art for ${rom.title}`} />
        </div>
      ) : null}
      <div>
        <h3>{rom.title}</h3>
        <Link className="handle" href={localize(lang, `/6502/builders/${rom.handle}`)}>
          {T.by(rom.handle)}
        </Link>
      </div>
      <p>{rom.blurb}</p>
      <dl className="kv">
        <div>
          <dt>{T.rom}</dt>
          <dd>{rom.rom_size} B</dd>
        </div>
        <div>
          <dt>{T.tiles}</dt>
          <dd>{rom.tiles}</dd>
        </div>
        <div>
          <dt>{T.hcFrame}</dt>
          <dd>{rom.frame_cost ?? T.notMeasured}</dd>
        </div>
        <div>
          <dt>{T.published}</dt>
          <dd>{day(rom.created)}</dd>
        </div>
      </dl>
      <p className="chips">
        {/* Here, not at games.tinymachines.ai. The service sends a `play_url`
            and it names the subdomain, which was right when the console was
            there and is a link off this site now that it is here. The console
            takes ?cart=<url> and always has. */}
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
  );
}

export function Builders({ api, lang = "en" }: { api: string; lang?: Lang }) {
  const T = L[lang];
  const { data, error } = useRegistry<Index>(`${api}/v1/registry`);

  if (!data) return <RegistryState error={error} what={T.what} lang={lang} />;

  return (
    <>
      <div className="chips">
        <span className="measured">{T.builders(data.count)}</span>
        <span className="measured">{T.carts(data.roms)}</span>
        <span className="measured">{T.limits(data.limits.roms, data.limits.cart_bytes / 1024)}</span>
      </div>

      <h2>{T.recent}</h2>
      {data.latest.length ? (
        <div className="reg-grid">
          {data.latest.map((r) => (
            <CartCard key={`${r.handle}/${r.slug}`} rom={r} api={api} lang={lang} />
          ))}
        </div>
      ) : (
        <p className="reg-state">{T.nothing}</p>
      )}

      <h2>{T.buildersTitle}</h2>
      {data.builders.length ? (
        <div className="reg-grid">
          {data.builders.map((b) => (
            <article key={b.handle} className="rail reg-card">
              <div className="reg-who">
                {b.avatar ? (
                  <ChrArt art={b.avatar} api={api} alt={`${b.name}'s avatar`} scale={2} />
                ) : null}
                <div>
                  <h3>{b.name}</h3>
                  <Link className="handle" href={localize(lang, `/6502/builders/${b.handle}`)}>
                    @{b.handle}
                  </Link>
                </div>
              </div>
              <p>{b.bio}</p>
              <p className="chips">
                <span className="tag">{T.cartCount(b.roms)}</span>
                <Link className="tag live" href={localize(lang, `/6502/builders/${b.handle}`)}>
                  {T.theirPage}
                </Link>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="reg-state">{T.nobody}</p>
      )}
    </>
  );
}
