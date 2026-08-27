import type { MDXComponents } from "mdx/types";
import { TwoWaysDemo } from "./app/components/TwoWaysDemo";
import { CopyPre } from "./app/components/CopyPre";

/**
 * Required at the project root. Without this file MDX pages fail to render,
 * and the message you get does not say that this is the reason, which is why
 * it is written down here and in README.md.
 *
 * It is deliberately empty of styling. Elements get their look from
 * ../style/components.css through app/globals.css, so a heading here and a
 * heading in the widget zoo are the same heading. Do not add per-element
 * classes: that forks the kit.
 *
 * The overrides are `code`, which is not styling (see below), and `pre`,
 * which is the same block with a Copy control on it (components/CopyPre.tsx).
 */

// A hex colour, and nothing else. Three, four, six or eight digits, anchored
// at both ends so `#define` and `#0500` addresses in the 6502 documents do not
// match. Four digits would collide with a hex address, so they are excluded:
// the palette has none, and a wrong swatch is worse than no swatch.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Inline code that is a hex colour gets a swatch of that colour beside it.
 *
 * This is the style guide's colour section being useful rather than being a
 * list of strings. STYLE.md writes the palette as markdown tables with the
 * values in backticks, so every hue shipped as six characters of monospace
 * text and the page describing the colours showed none of them.
 *
 * Derived, not authored: the swatch is filled from the value in the document,
 * so it cannot disagree with the number printed next to it, and adding a hue
 * to STYLE.md gives it a swatch with no work here. That is the same reason the
 * navigation is read from the directory tree.
 *
 * The colour arrives as an inline style because it IS data: it varies per
 * occurrence and there is no class that could carry it. Everything else about
 * the swatch is `.swatch` in the kit.
 */
function Code({ children, ...props }: React.ComponentPropsWithoutRef<"code">) {
  const text = typeof children === "string" ? children : null;
  if (text && HEX.test(text)) {
    return (
      <code {...props}>
        <span className="swatch" style={{ background: text }} aria-hidden="true" />
        {children}
      </code>
    );
  }
  return <code {...props}>{children}</code>;
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  // Components a document may use by name. Registered here rather than
  // imported inside each .mdx file, so a document stays markdown with one
  // element in it rather than markdown with an import path in it.
  return { ...components, code: Code, pre: CopyPre, TwoWaysDemo };
}
