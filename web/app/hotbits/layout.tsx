/**
 * The hotbits project's layout, and the only thing it does is the silo.
 *
 * `data-project="hotbits"` activates style/projects/hotbits.css, which today
 * overrides nothing: every lever is listed there commented out with no values,
 * because the palette, the display face and the mark are the owner's exactly
 * as the house palette was. This site's job is to have somewhere for them to
 * be dropped, not to invent them.
 *
 * So these pages are the house kit, unstyled by the project, and they will
 * change appearance the day that file is filled in. That is the mechanism
 * working rather than a page that has not been finished. See PROJECTS.md.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="hotbits">{children}</div>;
}
