import type { MDXComponents } from "mdx/types";

/**
 * Required at the project root. Without this file MDX pages fail to render,
 * and the message you get does not say that this is the reason, which is why
 * it is written down here and in README.md.
 *
 * It is deliberately empty of styling. Elements get their look from
 * ../style/components.css through app/globals.css, so a heading here and a
 * heading in the widget zoo are the same heading. Do not add per-element
 * classes: that forks the kit.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components };
}
