/**
 * The autopsy's layout, and the only thing it does is the silo:
 * `data-project="autopsy"` activates style/projects/autopsy.css, which
 * today overrides nothing. The palette, the display face and the mark are
 * the owner's; these pages are the house kit until that file is filled in.
 * See PROJECTS.md.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="autopsy">{children}</div>;
}
