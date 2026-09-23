import { allPages } from "./docs";
import { delocalize } from "./lang";
import { explorerPages } from "./explorer";
import { TRACKS } from "./tracks";
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
  /**
   * True for a page whose module must start from a fresh document. The
   * explorer's pages were written for full loads: their modules keep loops
   * and subscriptions at module scope with no teardown, so a client-side
   * navigation out of one leaves a zombie that breaks the transport store's
   * announce loop, and a client-side return to one never re-runs its init.
   * A plain anchor is the honest link until the modules learn a lifecycle.
   */
  hard?: boolean;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

/**
 * Every group, in the order they should appear: the site, then the projects.
 *
 * THE MENU IS THE TOP LEVEL, AND EACH CHOICE OPENS AN INDEX PAGE. Owner's
 * call, 2026-09-22, in two steps: first the panel lost everything below a
 * section's first level (it had been eighty-four lines on a documentation
 * page and forty-three inside the explorer), then the section group itself
 * ("just site and projects"). So the panel is the same seven-odd lines on
 * every page, and what is inside a section is that section's landing's job:
 * /docs opens with the tree, /nes with its parts, /6502 with its tracks and
 * its parts ledger. The e2e suite holds the other half of the bargain: each
 * project's landing links every surface that has arrived, and every page in
 * the sitemap is reached from the menu by walking the pages it lists
 * (e2e/menu.spec.ts).
 */
export function menuGroups(): MenuGroup[] {
  // Every entry carries a line of what it is, which is the part a list of
  // nouns cannot do. The lines come from the manifest's own `what`, first
  // sentence, rather than being written here: a menu that described a
  // surface differently from the page describing itself would be a second
  // description to keep in step.
  const roof = read().projects.find((p) => p.key === "roof");
  const hintFor = (href: string): string | undefined => {
    const s = roof?.surfaces.find((x) => x.lands_at === href);
    if (s) return firstSentence(s.what);
    // A project's own entry in the site group takes the project's description,
    // which is the same sentence its landing page opens with.
    const p = read().projects.find((x) => x.landing === href && x.key !== "roof");
    return p ? firstSentence(p.what) : undefined;
  };

  // The landings are their own group below, so the site group does not also
  // list them: the same destination twice in one panel is the reader's job
  // to reconcile, and it was the panel's job not to ask.
  const landings = new Set(
    projects()
      .filter((p) => p.key !== "roof" && p.landing)
      .map((p) => p.landing as string),
  );

  const groups: MenuGroup[] = [
    {
      title: "The site",
      items: [
        { href: "/", label: "Home", hint: "the front door" },
        ...siteNav()
          .filter((e) => !landings.has(e.href))
          .map((e) => ({ ...e, hint: hintFor(e.href) })),
      ],
    },
  ];

  // The projects, as a list of doors: one line each. This is all the panel
  // says about a project: its name and what it is. The parts inside are the
  // project's landing's business.
  const doors = projects().filter((p) => p.key !== "roof" && p.landing && arrivedSurfaces(p).length);
  if (doors.length) {
    groups.push({
      title: "Projects",
      items: doors.map((p) => ({ href: p.landing as string, label: p.name, hint: firstSentence(p.what) })),
    });
  }

  return groups;
}

/** A section of the site: a project's landing and its first level, for the strip under the bar. */
export interface Section {
  title: string;
  /** The landing's path: the strip shows on every page under it. */
  when: string;
  items: MenuItem[];
}

/**
 * Each project's first level, for the strip on every page inside it.
 *
 * The panel is the site and the projects and nothing deeper (owner,
 * 2026-09-22); the next morning, on a phone, the owner missed the second
 * level, and this is it: not back in the panel but under the bar, on every
 * page of a section, as the workbench pages already carry their own. The
 * rule for what is on it is the one the section group had before it went:
 * the landing (as "Overview"), the 6502's tracks, and each arrived surface
 * unless a page above it already lists it: a track's page for what its
 * headline names (a track's own path names nothing but itself), or, for a
 * surface a level deeper than the first, the surface one segment up when it
 * is the project's own. The signal's bench and its deep-dive are on
 * /nes/signal, not here; the explorer's pages are on the Lab and tools
 * page. A deeper page with no index of its own stays, because a page
 * nothing lists is a page nobody finds.
 */
export function sections(): Section[] {
  const out: Section[] = [];
  for (const p of projects()) {
    if (p.key === "roof" || !p.landing) continue;
    const here = arrivedSurfaces(p);
    if (!here.length) continue;
    const onTrack = new Set(
      p.key === "6502"
        ? TRACKS.flatMap((tr) => tr.headline.map((h) => h.href.replace(/#.*$/, "")).filter((h) => h !== tr.path))
        : [],
    );
    const routes = new Set(here.map((s) => s.lands_at));
    const listedAbove = (href: string): boolean => {
      if (onTrack.has(href)) return true;
      if (!href.startsWith(p.landing + "/")) return false;
      const above = href.replace(/\/[^/]+$/, "");
      return above !== p.landing && routes.has(above);
    };
    out.push({
      title: p.name,
      when: p.landing,
      items: [
        { href: p.landing, label: "Overview" },
        ...(p.key === "6502"
          ? TRACKS.filter((tr) => tr.path !== "/6502/archive").map((tr) => ({ href: tr.path, label: tr.name.en }))
          : []),
        ...here
          .filter((s) => s.lands_at !== p.landing && !listedAbove(s.lands_at))
          .map((s) => ({ href: s.lands_at, label: s.nav_label ?? s.name, hard: isHardRoute(s.lands_at), prerendered: s.prerendered })),
      ],
    });
  }
  return out;
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

  // The tracks' sub-landings, from the one place they are named.
  for (const tr of TRACKS) if (!(tr.path in out)) out[tr.path] = tr.name.en;

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

/**
 * Whether a link to this route must be a full navigation. See MenuItem.hard:
 * a page built by a module that keeps state at module scope, binds this
 * document at load and has no teardown must start from a fresh document.
 * One answer, asked by every component that renders a computed link, so a
 * page cannot forget the rule.
 *
 * Three kinds of page qualify, and the last two were added on 2026-08-28
 * after the owner reported "nested windows" arriving at the Lab through the
 * language flag: the explorer's pages, the Halfwave Lab and the console.
 * What a client-side arrival gets is the markup with nothing built in it,
 * because a module already in the browser's registry does not run again
 * however the script tag is re-inserted: the Lab kept its own player beside
 * the site's strip, and the console arrived with a blank screen and no
 * handlers bound. Leaving one that way is the other half of the same rule:
 * game.js's frame loop would go on posting frames at a canvas that is gone.
 */
export function isHardRoute(href: string): boolean {
  const { path } = delocalize(href);
  return MODULE_PAGES.has(path) || explorerPages().some((p) => `/6502/${p.slug}` === path);
}

/** The two module pages that are not explorer pages. */
const MODULE_PAGES = new Set(["/6502/lab", "/6502/games"]);
