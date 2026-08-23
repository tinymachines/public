import { allPages } from "./docs";
import { projects, nav as siteNav } from "./projects";

/**
 * The whole navigation model, derived at build time.
 *
 * One module because the three things a reader needs to move around are the
 * same three facts seen differently: where they can go (the menu), where they
 * are (the crumbs), and what each place is called (the labels). Writing those
 * separately is how a menu, a breadcrumb and a page title end up disagreeing
 * about what a page is named, and nothing looks wrong when they do.
 *
 * Nothing here is a list. The site groups come from data/projects.json, the
 * documentation group from the directory tree, and the labels from both. A
 * page that exists appears; a page that is deleted vanishes; neither takes an
 * edit here. If you find yourself adding a literal route below, stop.
 */

export interface MenuItem {
  href: string;
  label: string;
  /** One line on what it is. A bare list of nouns cannot say why to choose one. */
  hint?: string;
}

export interface MenuGroup {
  title: string;
  /**
   * The path prefix this group belongs to, or null for the group shown
   * everywhere. The menu picks groups by matching the current path, so a
   * section's own contents appear when you are in it and not otherwise. That
   * is what makes each subsection's menu its own without any page passing it.
   */
  when: string | null;
  items: MenuItem[];
}

/** Every group, in the order they should appear. */
export function menuGroups(): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      title: "The site",
      when: null,
      items: [{ href: "/", label: "Home", hint: "the front door" }, ...siteNav()],
    },
  ];

  // The documentation tree, flattened. Its shape is already rendered as a tree
  // in the docs sidebar; here it is a list, because a menu that reproduces a
  // hierarchy inside a panel is two navigations for one set of pages.
  const docs = allPages().filter((p) => p.route !== "/docs");
  if (docs.length) {
    groups.push({
      title: "Documentation",
      when: "/docs",
      items: docs.map((p) => ({ href: p.route, label: p.title, hint: p.description })),
    });
  }

  // Each project's surfaces, but only the ones that have actually arrived.
  // A menu entry pointing at a subdomain would be a menu that takes you off
  // the site while claiming to be the site's own navigation.
  for (const p of projects()) {
    if (p.key === "roof" || !p.landing) continue;
    const here = p.surfaces.filter((s) => s.status !== "not started" && s.lands_at_settled);
    if (!here.length) continue;
    groups.push({
      title: p.name,
      when: p.landing,
      items: [
        { href: p.landing, label: `${p.name} overview`, hint: "what this project is, and where each surface lives" },
        ...here.map((s) => ({ href: s.lands_at, label: s.name, hint: s.what.split(/(?<=\.)\s/)[0] })),
      ],
    });
  }

  return groups;
}

/**
 * Path to display name, for the breadcrumbs.
 *
 * Built from the same sources as the menu, so a crumb cannot call a page
 * something the menu does not. Every page had its crumb written out by hand
 * before this, seven times, as `<b>tinymachines</b> / 6502 / lab`: a literal
 * per page, which is the arrangement this repository keeps finding at the
 * bottom of its bugs.
 */
export function labels(): Record<string, string> {
  const out: Record<string, string> = {};

  // Least authoritative first, because the later writer wins and the manifest
  // is the more considered name. Both orders were wrong before this: with the
  // manifest first, /docs took its label from docs/index.md's frontmatter and
  // came out as "tinymachines" rather than "Documentation"; with "/" written
  // first, the roof's own `site` surface overwrote it with "The main site".
  for (const p of allPages()) out[p.route] = p.title;

  for (const p of projects()) {
    if (p.landing && p.key !== "roof") out[p.landing] = p.name;
    for (const s of p.surfaces) {
      // The roof's `site` surface IS the root, and its name describes the
      // surface rather than naming the place. The root is the site.
      if (s.lands_at === "/") continue;
      if (s.lands_at_settled) out[s.lands_at] = s.nav_label ?? s.name;
    }
  }

  const roof = projects().find((p) => p.key === "roof");
  out["/"] = roof ? roof.name : "tinymachines";

  // The zoo is a route under /style rather than a surface of its own, so it
  // is not in the manifest and is named from the one other place its name
  // exists: the page's own metadata title.
  out["/style/zoo"] = "Widget zoo";

  return out;
}

/**
 * Where to send a reader for a piece: here, if it has arrived; its own
 * subdomain, if it has not.
 *
 * The front page was sending people to games.tinymachines.ai and
 * halfwave.tinymachines.ai for two surfaces that now live on this site. It was
 * reading `public_url` from data/pieces.json, which is still true and no
 * longer the answer: a piece's public URL is where it has always answered, and
 * where to READ it is a different question once it has moved.
 *
 * Two files described the same thing and the page read the older one, which is
 * the arrangement this repository keeps finding at the bottom of its bugs. So
 * the answer is derived from the manifest, joined to the piece by the key that
 * already ties them, and the subdomain is the fallback rather than the
 * default.
 *
 * `onSite` is returned rather than inferred from the href, so a caller can say
 * "live here" or "still on its own subdomain" without parsing a URL.
 */
export function whereToRead(pieceKey: string, publicUrl: string | null): { href: string | null; onSite: boolean } {
  for (const p of projects()) {
    for (const s of p.surfaces) {
      if (s.piece !== pieceKey) continue;
      // "not started" is the manifest saying it has not moved. Anything else
      // means at least part of it is here, and lands_at_settled means the path
      // is a decision rather than a proposal: linking to a proposed path would
      // be linking to a route that does not exist yet.
      if (s.status !== "not started" && s.lands_at_settled) {
        return { href: s.lands_at, onSite: true };
      }
    }
  }
  return { href: publicUrl, onSite: false };
}
