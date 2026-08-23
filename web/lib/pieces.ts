import fs from "node:fs";
import path from "node:path";

/**
 * The six pieces, read from ../data/pieces.json at build time.
 *
 * The same file the API reads. It is not imported from api/, and it is not
 * copied here: both sides load the one JSON, so neither owns it and neither
 * can drift. The API additionally validates it against the Pydantic model that
 * generates openapi.json, which is where a malformed record is caught.
 *
 * Read with fs rather than a JSON import so the failure is a build error
 * naming this file and this reason, instead of a module resolution message
 * about a path outside the app directory.
 */

export interface Piece {
  key: string;
  name: string;
  what: string;
  source: string;
  ships_as: string;
  code_licence: string;
  data_terms: string;
  public_url: string | null;
  not_hosted_because: string | null;
}

const DATA = path.join(process.cwd(), "..", "data", "pieces.json");

const REQUIRED: (keyof Piece)[] = [
  "key", "name", "what", "source", "ships_as", "code_licence", "data_terms",
];

export function pieces(): Piece[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch (e) {
    throw new Error(
      `data/pieces.json could not be read (${(e as Error).message}). It is the ` +
        `one copy of the six pieces and both the API and this site read it.`,
    );
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("data/pieces.json should be a non-empty array of pieces.");
  }

  // Checked here as well as in the API, because this side renders them and a
  // missing field would silently become an empty cell on the front page.
  for (const [i, row] of raw.entries()) {
    for (const field of REQUIRED) {
      if (!row[field]) {
        throw new Error(`data/pieces.json[${i}] has no ${field}.`);
      }
    }
    // Null is a real answer for public_url, but null with no reason reads as
    // an oversight. Same rule the API's test holds.
    if (!row.public_url && !row.not_hosted_because) {
      throw new Error(
        `data/pieces.json[${i}] (${row.key}) has no public_url and no reason why not.`,
      );
    }
  }

  return raw as Piece[];
}
