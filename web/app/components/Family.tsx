/**
 * The Meatball Labs family strip, for the footer.
 *
 * Meatball Labs is the parent of a small family of sites. Each carries this
 * same row of nine dots, its own marked, so the sites read as related without
 * sharing a logo (the rule is the family's style guide,
 * meatball.ai/styleguide.html). The look is the kit's `.family` component and
 * the colours are its `--color-family-*` tokens; this file only says which
 * dots are sites, where they live, and which one is this site.
 *
 * Kept identical across the three sites on purpose: bradley.io and
 * meatball.ai carry the same list, in the same order, each marking itself.
 */

type Hue = "clay" | "ochre" | "moss" | "sage" | "spruce" | "steel" | "iris" | "plum" | "rose";

/** The colour wheel, warm to cool. Fixed order; a new site takes an open hue. */
const FAMILY: { hue: Hue; name?: string; href?: string }[] = [
  { hue: "clay", name: "Meatball Labs", href: "https://meatball.ai" },
  { hue: "ochre", name: "SysForge", href: "https://sysforge.ai" },
  { hue: "moss" },
  { hue: "sage" },
  { hue: "spruce" },
  { hue: "steel", name: "bradley.io", href: "https://bradley.io" },
  { hue: "iris", name: "tinymachines.ai", href: "https://tinymachines.ai" },
  { hue: "plum" },
  { hue: "rose" },
];

export function Family({ me }: { me: Hue }) {
  return (
    <nav className="family" aria-label="Meatball Labs and family">
      {FAMILY.map((f) => {
        if (f.hue === me) {
          return (
            <span
              key={f.hue}
              className="family-dot is-me"
              data-hue={f.hue}
              aria-current="page"
              title={`${f.name} (you are here)`}
            />
          );
        }
        if (f.href && f.name) {
          return (
            <a
              key={f.hue}
              className="family-dot"
              data-hue={f.hue}
              href={f.href}
              aria-label={f.name}
              title={f.name}
            />
          );
        }
        return <span key={f.hue} className="family-dot" data-hue={f.hue} aria-hidden="true" />;
      })}
    </nav>
  );
}
