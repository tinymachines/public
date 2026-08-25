import type { Root } from "postcss";

/**
 * The kit's line weight and corner, applied to a ported stylesheet.
 *
 * The explorer pages and the Lab arrived with their own idea of an edge: 2px
 * and 3px borders, corners of 3 to 8px. The kit has one border (1px) and one
 * radius on paper (`--radius-hair`, 2px; STYLE.md section 6, the zoo is the
 * reference), and a page that keeps its own edges reads as a page from
 * somewhere else, however well its colours are mapped. Owner's call,
 * 2026-08-25: tie the lab and tool screens back to the style guide.
 *
 * Done here, on the parsed stylesheet, rather than as a list of selectors in
 * a CSS file: the list would be a second copy of the upstream stylesheet's
 * class names, and it drifted the first time it was measured (forty-odd
 * classes across twenty pages). Every rule is rewritten by what it says,
 * not by what it is called. Not one upstream file is edited.
 *
 * What changes: a border width of 2px or 3px becomes 1px, in `border`, its
 * four sides and `border-width`. A `border-radius` above 2px in px, rem or
 * em becomes the hair radius. What does not: 0 and 1px stay; percentages
 * stay (a circle is a circle); outlines stay (focus rings are the kit's own
 * concern, and thicker is right there); `border-spacing` and `border-collapse`
 * are not borders.
 */
export function kitBorders(root: Root, who: string): number {
  let changed = 0;
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase();
    if (/^border(-(top|right|bottom|left))?(-width)?$/.test(prop)) {
      const v = d.value.replace(/(^|\s)([23])px(?=\s|$)/g, (_m, sp) => `${sp}1px`);
      if (v !== d.value) { d.value = v; changed += 1; }
      return;
    }
    if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) {
      const v = d.value.replace(/(^|\s|\/)(\d*\.?\d+)(px|rem|em)(?=\s|$|\/)/g, (m, sp, n, unit) => {
        const px = unit === "px" ? Number(n) : Number(n) * 16;
        return px > 2 ? `${sp}var(--radius-hair)` : m;
      });
      if (v !== d.value) { d.value = v; changed += 1; }
    }
  });
  if (changed < 1) {
    throw new Error(`${who}: the border pass changed nothing. Either the stylesheet already wears the kit's edge, in which case this can go, or the match broke.`);
  }
  return changed;
}
