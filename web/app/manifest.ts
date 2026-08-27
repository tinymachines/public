import type { MetadataRoute } from "next";
import { siteManifest } from "@/lib/manifest";

/** The site's manifest. lib/manifest.ts says what is in it and why. */
export default function manifest(): MetadataRoute.Manifest {
  return siteManifest();
}
