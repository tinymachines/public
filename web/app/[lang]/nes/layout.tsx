/**
 * The NES console project's layout, and the only thing it does is the
 * silo: `data-project="nes"` activates style/projects/nes.css, which
 * today turns exactly one knob (the accent is Mustard Conductor, the
 * last unclaimed categorical hue). Every other lever is listed there
 * commented out, because the palette, the display face and the mark
 * are the owner's. See PROJECTS.md.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="nes">{children}</div>;
}
