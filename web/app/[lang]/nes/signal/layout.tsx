/**
 * The ntsc-crt project's layout, and the only thing it does is the silo.
 *
 * `data-project="ntsc"` activates style/projects/ntsc.css, which today turns
 * exactly one knob: the accent is Ocean Data, chosen from the four
 * categorical hues rather than invented. Every other lever is listed there
 * commented out with no values, because the palette, the display face and
 * the mark are the owner's, exactly as hotbits' are. See PROJECTS.md.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="ntsc">{children}</div>;
}
