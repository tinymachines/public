import "./nes.css";

/**
 * The NES console project's layout, and the only thing it does is the
 * silo: `data-project="nes"` activates style/projects/nes.css, which
 * today turns exactly one knob (the accent is Mustard Conductor, the
 * last unclaimed categorical hue). Every other lever is listed there
 * commented out, because the palette, the display face and the mark
 * are the owner's. See PROJECTS.md. It also imports the section's
 * figure and pad styles (./nes.css), once, for the landing and every part
 * page under it; they were the landing's own import until the reports
 * moved to the part pages.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="nes">{children}</div>;
}
