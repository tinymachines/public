import { notFound } from "next/navigation";

/**
 * The route that exists so that no route pretends to.
 *
 * A not-found.tsx inside [lang] only renders for notFound() thrown from a
 * MATCHED route in that segment; a URL that matches nothing falls through to
 * Next's global default 404, which is unstyled and monolingual. This catch-all
 * matches everything the real routes did not (static segments always win over
 * a dynamic one), throws notFound(), and the boundary in [lang]/not-found.tsx
 * renders inside the [lang] layout.
 *
 * dynamicParams is true HERE, deliberately against the grain of every other
 * route in this tree: this segment's whole job is to match paths nobody
 * generated. The [lang] layout's own false still holds for the language
 * segment, so an invalid language is a 404 before this page is reached.
 */
export const dynamicParams = true;

export default function CatchAll() {
  notFound();
}
