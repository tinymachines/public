import { ELECTRIC, FAMILY, FAMILY_LABEL, type FamilyHue } from "@/lib/family-data";

/**
 * The Meatball Labs family strip, for the footer.
 *
 * Meatball Labs is the parent of a small family of sites. Each carries this
 * same row of dots, its own marked: the nine muted hues, then the five of
 * the electric set, the sites that wear a hue turned up for a dark screen, so the sites read as related without
 * sharing a logo (the rule is the family's style guide,
 * meatball.ai/styleguide.html). The look is the kit's `.family` component and
 * the colours are its `--color-family-*` tokens; this file only marks which
 * dot is this site.
 *
 * The list itself (which dots are sites, where they live, their order) is
 * the family's one registry, meatball-labs/family/family.json, copied in as
 * lib/family-data.ts by scripts/sync-family.sh and held to it by the deploy.
 */

export function Family({ me }: { me: FamilyHue }) {
  return (
    <nav className="family" aria-label={FAMILY_LABEL}>
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
        // A hue held for a site that is not answering: named, not linked.
        if (f.reserved && f.name) {
          return <span key={f.hue} className="family-dot" data-hue={f.hue} role="img" aria-label={`${f.name}, coming`} title={`${f.name} (coming)`} />;
        }
        return <span key={f.hue} className="family-dot" data-hue={f.hue} aria-hidden="true" />;
      })}
      {/* The electric set, each in its core tone. The kit has no token for
          these yet, so the colour comes from the registry itself, inline. */}
      {ELECTRIC.map((e) => {
        const style = { background: e.tones.core };
        if (e.href && e.who && !e.reserved) {
          return <a key={e.id} className="family-dot" data-electric={e.id} style={style} href={e.href} aria-label={e.who} title={e.who} />;
        }
        if (e.reserved && e.who) {
          return <span key={e.id} className="family-dot" data-electric={e.id} style={style} role="img" aria-label={`${e.who}, coming`} title={`${e.who} (coming)`} />;
        }
        return <span key={e.id} className="family-dot" data-electric={e.id} style={style} aria-hidden="true" />;
      })}
    </nav>
  );
}
