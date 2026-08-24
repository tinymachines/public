"use client";

import Link from "next/link";
import { ChrArt } from "../../../components/ChrArt";
import { RegistryState, useRegistry } from "../../../components/RegistryData";
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

/** The publish-time run, shown rather than summarised. */
function Measured({ rom }: { rom: Rom }) {
  const m = rom.measured;
  return (
    <div className="panel">
      <div className="panel-bar">
        <span>measured at publish</span>
        <span>on the die</span>
      </div>
      <div className="panel-face">
        <table className="readout">
          <tbody>
            <tr>
              <th>booted</th>
              <td className="num">{m.booted ? "yes" : "no"}</td>
            </tr>
            <tr>
              <th>frames finished</th>
              <td className="num">
                {m.frames_completed} of {m.frames_requested}
              </td>
            </tr>
            <tr>
              <th>half-cycles a frame</th>
              <td className="num">{m.half_cycles.join(", ")}</td>
            </tr>
            <tr>
              <th>screen changed</th>
              <td className="num">{m.screen_changed ? "yes" : "no"}</td>
            </tr>
            <tr>
              <th>tiles used</th>
              <td className="num">
                {m.tiles_used.length} of {rom.tiles}
              </td>
            </tr>
            <tr>
              <th>cartridge</th>
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

export function Builder({ handle, api }: { handle: string; api: string }) {
  const { data, error } = useRegistry<Doc>(
    `${api}/v1/registry/b/${encodeURIComponent(handle)}`,
  );

  if (!data) return <RegistryState error={error} what={`@${handle}`} />;

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
            <span className="measured">
              <b>
                {data.roms.length}{" "}
                {data.roms.length === 1 ? "cartridge" : "cartridges"}
              </b>{" "}
              published, joined {day(data.created)}
            </span>
            {data.links.map((l) => (
              <a key={l.url} className="tag" data-address href={l.url} rel="nofollow ugc noopener">
                {l.label}
              </a>
            ))}
          </p>
        </div>
      </div>

      <h2>What they have published</h2>
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
                <span className="handle">
                  {rom.slug} &middot; {rom.rom_size} B of ROM, {rom.tiles} tiles
                </span>
              </div>
              <p>{rom.blurb}</p>
              <Measured rom={rom} />
              <p className="chips">
                <Link
                  className="tag live"
                  href={`/6502/games?cart=${encodeURIComponent(api + rom.cart_url)}`}
                >
                  play it
                </Link>
                <a className="tag" data-address href={`${api}${rom.cart_url}`}>
                  .cart.gz
                </a>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="reg-state">
          <b>@{data.handle}</b> has a page and has published nothing yet.
        </p>
      )}
    </>
  );
}
