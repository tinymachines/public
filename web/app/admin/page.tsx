import type { Metadata } from "next";
import { AdminConsole } from "../components/AdminConsole";
import { Shell } from "../components/SiteFrame";

/**
 * /admin: dev keys, and the people they belong to.
 *
 * The shell is a server component so it can export metadata; everything that
 * talks to the API is in AdminConsole, which is a client component. That split
 * is not ceremony. A "use client" module cannot export metadata at all, so the
 * alternative is a page with no robots directive, and this is the one route on
 * the site that must carry one.
 *
 * The page prerenders as the signed-out shell and nothing else, because there
 * is nothing else to prerender: every row on it needs a key, and the key
 * arrives in a browser. So this route ships no data and could not leak any.
 *
 * NOT in robots.txt, and that is the same reasoning app/robots.ts already
 * carries: Disallow stops a crawler FETCHING the page, so it never reads the
 * noindex below, and the URL can still be listed from an inbound link with no
 * description. Allowing the fetch is what makes the noindex effective.
 * Disallowing it here would quietly defeat the thing it looks like it is
 * strengthening.
 *
 * It is not in the site navigation either. That is not security, and nothing
 * here pretends it is: the gate is the key the API demands. It is simply not a
 * page a reader has any use for.
 */

export const metadata: Metadata = {
  title: "Admin",
  description: "Dev keys, and the people they belong to.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <Shell die="ADM" title="Admin" crumb={<><b>tinymachines</b> / admin</>}>
      <AdminConsole />
    </Shell>
  );
}
