import type { Metadata } from "next";
import { chipApi } from "@/lib/projects";
import { Shell } from "../../components/SiteFrame";
import { Builders } from "./Builders";
import "./registry.css";

/**
 * /6502/builders: the registry, moved off games.tinymachines.ai.
 *
 * ## What moved, and what could not
 *
 * The reading half. `GET /v1/registry` and `GET /v1/registry/b/{handle}` both
 * send `Access-Control-Allow-Origin: *`, deliberately, so this origin can ask
 * for them: CLAUDE.md records that the subdomains stay for now and that the
 * 6502 API is open for exactly this reason.
 *
 * The writing half could not, and the reason is measured rather than guessed.
 * A preflight from this origin comes back allowing `GET, POST, OPTIONS` and
 * listing `Accept, Accept-Language, Content-Language, Content-Type` as the
 * headers it will accept. `Authorization` is not among them, so a browser on
 * this site cannot send a bearer token to that service at all: not to claim a
 * handle, not to edit a page, not to publish a ROM. It is not a decision
 * waiting to be made, it is a header that is not there.
 *
 * The obvious way round is to proxy the writes through this site's own API,
 * where there is no browser and therefore no preflight. That is the wrong
 * move today and it is worth writing down why: tinymachines/6502#9 items 5
 * and 6, the read-only service scope and the identity binding, were left
 * undone on purpose because if games moves under the apex they both turn into
 * an internal join. Building a credentialed proxy now would be building the
 * boundary that is about to stop existing, and then having to unbuild it.
 *
 * So this page reads, and says where publishing is. See PROJECTS.md.
 */

export const metadata: Metadata = {
  title: "Builders",
  description:
    "Everyone publishing cartridges for the transistor-level 6502, and what they have published.",
};

export default function BuildersPage() {
  return (
    <Shell die="REG" title="Builders">
      <main className="prose">
        <p>
          A cartridge is one gzipped file carrying a ROM, its tiles and the
          contract it was written to. Publishing one does not upload a claim
          about it: the registry runs it on the die, and what you see under
          each cartridge below is what the chip did, not what its author typed.
          A ROM that never finishes a frame is not listed.
        </p>

        <Builders api={chipApi()} />

        <h2>Publishing is still on the subdomain</h2>
        <p>
          Claiming a handle, editing a page and publishing a cartridge all send
          a bearer token, and a browser on this site cannot send one to that
          service. A preflight from here comes back allowing{" "}
          <code>GET, POST, OPTIONS</code> and accepting four headers, none of
          which is <code>Authorization</code>. That is a header that is not
          there rather than a decision that has not been taken, so the editor
          stays where it works, at{" "}
          <a data-address href="https://games.tinymachines.ai/manage">
            games.tinymachines.ai/manage
          </a>
          , until it does.
        </p>
      </main>
    </Shell>
  );
}
