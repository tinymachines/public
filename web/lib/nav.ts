import { allPages } from "./docs";
import { explorerMenu } from "./explorer-menu";
import { arrivedSurfaces, projects, read, nav as siteNav } from "./projects";

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

/**
 * The first sentence, which is as much as a menu line can carry.
 *
 * The manifest's `what` is written for a page that has room; a hint under a
 * label has one or two lines. Taking the first sentence rather than truncating
 * means the line always ends where the author ended it, instead of in the
 * middle of a clause with an ellipsis.
 */
function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  // The trailing full stop comes off: a hint is a fragment under a label,
  // and half the hints (theirs, hand-written for menus) never had one, so
  // the mix read as sloppiness rather than punctuation.
  return (m ? m[0] : text).trim().replace(/\.$/, "");
}

export interface MenuItem {
  href: string;
  label: string;
  /** One line on what it is. A bare list of nouns cannot say why to choose one. */
  hint?: string;
  /**
   * False when something other than this site's build serves it. Those need a
   * plain anchor: the client router would try to navigate to a route it does
   * not have and land on the not-found page.
   */
  prerendered?: boolean;
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
  /**
   * An exact list of routes the group belongs to, for a section whose pages
   * are flat rather than nested. The explorer's eighteen pages live at
   * /6502/<slug>, beside the landing and the console, so a prefix cannot
   * pick them out; this can. When present it replaces the prefix test.
   */
  only?: string[];
  items: MenuItem[];
}

/** Every group, in the order they should appear. */
export function menuGroups(): MenuGroup[] {
  // Every entry carries a line of what it is, which is the part a list of
  // nouns cannot do. On the 6502 site the example was that "Blueprint",
  // "Schematic" and "Exploded" are three drawings of the same silicon and the
  // bare list gave a reader no way to choose between them.
  //
  // The lines come from the manifest's own `what`, first sentence, rather than
  // being written here: a menu that described a surface differently from the
  // page describing itself would be a second description to keep in step.
  const roof = read().projects.find((p) => p.key === "roof");
  const hintFor = (href: string): string | undefined => {
    const s = roof?.surfaces.find((x) => x.lands_at === href);
    if (s) return firstSentence(s.what);
    // A project's own entry in the site group takes the project's description,
    // which is the same sentence its landing page opens with.
    const p = read().projects.find((x) => x.landing === href && x.key !== "roof");
    return p ? firstSentence(p.what) : undefined;
  };

  // The landings are their own groups below, shown on every page, so the site
  // group does not also list them: the same destination twice in one panel is
  // the reader's job to reconcile, and it was the panel's job not to ask.
  const landings = new Set(
    projects()
      .filter((p) => p.key !== "roof" && p.landing)
      .map((p) => p.landing as string),
  );

  const groups: MenuGroup[] = [
    {
      title: "The site",
      when: null,
      items: [
        { href: "/", label: "Home", hint: "the front door" },
        ...siteNav()
          .filter((e) => !landings.has(e.href))
          .map((e) => ({ ...e, hint: hintFor(e.href) })),
      ],
    },
  ];

  // The projects, as a list of doors: one line each, shown everywhere. This
  // is what the front page's menu is FOR, and it is all the front page needs
  // to say about a project: its name and what it is. The parts inside a
  // project are that project's own business, below.
  const doors = projects().filter((p) => p.key !== "roof" && p.landing && arrivedSurfaces(p).length);
  if (doors.length) {
    groups.push({
      title: "Projects",
      when: null,
      items: doors.map((p) => ({ href: p.landing as string, label: p.name, hint: firstSentence(p.what) })),
    });
  }

  // Each project's surfaces, but only the ones that have actually arrived,
  // and only INSIDE that project. This went back and forth: scoped first,
  // then shown everywhere because the front page could not tell you the 6502
  // section had seven surfaces, and that turned the front page's menu into
  // a directory of every sub-page on the site. The doors list above answers
  // the first complaint; scoping answers the second. Inside a project the
  // menu opens on that project, which is the recipe card the owner asked
  // for: the thing under your hand, not the whole cookbook.
  for (const p of projects()) {
    if (p.key === "roof" || !p.landing) continue;
    const here = arrivedSurfaces(p);
    if (!here.length) continue;
    groups.push({
      title: p.name,
      when: p.landing,
      items: [
        // "Overview", not "<name> overview": the item sits under a group
        // heading that already says whose overview it is, and a label that
        // repeats its own heading reads as noise, not navigation.
        { href: p.landing, label: "Overview", hint: "what this project is, and where each surface lives" },
        ...here.map((s) => ({
          href: s.lands_at,
          // The same expression labels() uses. This file's whole claim is that
          // a crumb cannot call a page something the menu does not, and the
          // two had drifted the moment a surface was given a shorter name for
          // a path: the crumb read "The hotbits API" and the menu still said
          // "The entropy gateway" for the same link.
          label: s.nav_label ?? s.name,
          hint: firstSentence(s.what),
          prerendered: s.prerendered,
        })),
      ],
    });
  }

  // The section-local detail, after the map rather than instead of it.
  //
  // The documentation tree, flattened. Its shape is already rendered as a tree
  // in the docs sidebar; here it is a list, because a menu that reproduces a
  // hierarchy inside a panel is two navigations for one set of pages.
  const docs = allPages().filter((p) => p.route !== "/docs");
  if (docs.length) {
    groups.push({
      title: "Documentation",
      when: "/docs",
      items: docs.map((p) => ({
        href: p.route,
        label: p.title,
        hint: p.description?.replace(/\.$/, ""),
      })),
    });
  }

  // The explorer's eighteen pages, in the clusters and words their own menu
  // gives them, read from their site-menu.js rather than restated. Scoped to
  // /6502 because eighteen entries belong to the reader who is in that
  // section; everyone else gets "The explorer" in the 6502 group above.
  groups.push(...explorerMenu());

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
    for (const s of p.surfaces) {
      // The roof's `site` surface IS the root, and its name describes the
      // surface rather than naming the place. The root is the site.
      if (s.lands_at === "/") continue;
      if (s.lands_at_settled) out[s.lands_at] = s.nav_label ?? s.name;
    }
    // A project's own name wins for its own landing path, and it is written
    // AFTER the surfaces for that reason. hotbits is the case: its instrument
    // lands at /hotbits, which is also the project's page, so the crumb read
    // "tinymachines.ai / The Geiger TRNG" for a page headed "hotbits". A
    // surface describes a thing that arrived; a landing page names the project
    // it arrived under, and at the same path the second is the answer.
    if (p.landing && p.key !== "roof") out[p.landing] = p.name;
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
