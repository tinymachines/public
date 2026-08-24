"use client";

import Link from "next/link";
import { ChrArt } from "@/app/components/ChrArt";
import { RegistryState, useRegistry } from "@/app/components/RegistryData";
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

export function CartCard({ rom, api }: { rom: Rom; api: string }) {
  return (
    <article className="rail reg-card">
      {rom.cover ? (
        <div className="reg-cover">
          <ChrArt art={rom.cover} api={api} alt={`Cover art for ${rom.title}`} />
        </div>
      ) : null}
      <div>
        <h3>{rom.title}</h3>
        <Link className="handle" href={`/6502/b/${rom.handle}`}>
          by {rom.handle}
        </Link>
      </div>
      <p>{rom.blurb}</p>
      <dl className="kv">
        <div>
          <dt>ROM</dt>
          <dd>{rom.rom_size} B</dd>
        </div>
        <div>
          <dt>Tiles</dt>
          <dd>{rom.tiles}</dd>
        </div>
        <div>
          <dt>Half-cycles a frame</dt>
          <dd>{rom.frame_cost ?? "not measured"}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{day(rom.created)}</dd>
        </div>
      </dl>
      <p className="chips">
        {/* Here, not at games.tinymachines.ai. The service sends a `play_url`
            and it names the subdomain, which was right when the console was
            there and is a link off this site now that it is here. The console
            takes ?cart=<url> and always has. */}
        <Link className="tag live" href={`/6502/games?cart=${encodeURIComponent(api + rom.cart_url)}`}>
          play it
        </Link>
        <a className="tag" data-address href={`${api}${rom.cart_url}`}>
          .cart.gz
        </a>
      </p>
    </article>
  );
}

export function Builders({ api }: { api: string }) {
  const { data, error } = useRegistry<Index>(`${api}/v1/registry`);

  if (!data) return <RegistryState error={error} what="the builders" />;

  return (
    <>
      <div className="chips">
        <span className="measured">
          <b>
            {data.count} {data.count === 1 ? "builder" : "builders"}
          </b>{" "}
          counted by the registry when this page loaded
        </span>
        <span className="measured">
          <b>
            {data.roms} {data.roms === 1 ? "cartridge" : "cartridges"}
          </b>{" "}
          published, each one re-run on the die before it was listed
        </span>
        <span className="measured">
          <b>{data.limits.roms} cartridges a builder</b> and{" "}
          {data.limits.cart_bytes / 1024} KB each, read from the registry&rsquo;s
          own limits rather than from anything written here
        </span>
      </div>

      <h2>Recently published</h2>
      {data.latest.length ? (
        <div className="reg-grid">
          {data.latest.map((r) => (
            <CartCard key={`${r.handle}/${r.slug}`} rom={r} api={api} />
          ))}
        </div>
      ) : (
        <p className="reg-state">Nothing has been published yet.</p>
      )}

      <h2>Builders</h2>
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
                  <Link className="handle" href={`/6502/b/${b.handle}`}>
                    @{b.handle}
                  </Link>
                </div>
              </div>
              <p>{b.bio}</p>
              <p className="chips">
                <span className="tag">
                  {b.roms} {b.roms === 1 ? "cartridge" : "cartridges"}
                </span>
                <Link className="tag live" href={`/6502/b/${b.handle}`}>
                  their page
                </Link>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="reg-state">Nobody has claimed a handle yet.</p>
      )}
    </>
  );
}
