"use client";

import { useEffect, useState } from "react";
import { sha256 } from "@/lib/flowStore";

/**
 * The SHA-256 of the image the console is running, as the file store keys
 * everything it keeps per game (moments, the code blocks of a cartridge
 * from the disk). Null until it is known, and null again the instant
 * another image is loaded: each answer names the bytes it was taken of,
 * so a digest of the last game never stands under the next one.
 */
export function useDigest(rom: Uint8Array | null): string | null {
  const [hashed, setHashed] = useState<{ rom: Uint8Array; sha: string } | null>(null);
  useEffect(() => {
    if (!rom) return;
    let live = true;
    void sha256(rom).then((h) => live && setHashed({ rom, sha: h }));
    return () => {
      live = false;
    };
  }, [rom]);
  return hashed && hashed.rom === rom ? hashed.sha : null;
}
