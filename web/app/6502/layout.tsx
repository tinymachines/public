/**
 * The 6502 project's layout, and the only thing it does is the silo.
 *
 * `data-project="6502"` is what activates style/projects/6502.css, which
 * scopes that project's identity tokens. Stamping it here rather than on each
 * page is the whole mechanism: **a route is in a project because of where it
 * sits**, not because somebody remembered to say so. When the explorer, the
 * games and the lab move under here, they are siloed on arrival and nothing
 * has to be added to them.
 *
 * The kit is not forked and no component changes. What a silo may override is
 * a short list of identity tokens, and style/check-silo.py fails when one
 * reaches past it: red means ASSERTION FAILED on every project, and a project
 * that could redefine it would have made a failed assertion look fine
 * somewhere. See PROJECTS.md.
 *
 * A <div> rather than a fragment, because the attribute needs an element to
 * sit on and it must wrap the content it scopes.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div data-project="6502">{children}</div>;
}
