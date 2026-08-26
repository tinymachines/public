import type { Lang } from "@/lib/lang";
import { ChipTransport } from "./explorer/ChipTransport";

/**
 * The 6502 project's layout: the silo, and the one chip strip.
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
 *
 * The chip transport is mounted HERE, once, for every route in the project
 * (owner's call, 2026-08-26: one strip, one running chip). It renders only
 * on a page that declares a chip floor (`.workbench.has-transport`) and
 * withdraws on the rest, so the pages mount nothing and cannot carry a
 * second one. ChipTransport.tsx has the rest.
 */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return (
    <div data-project="6502">
      {children}
      <ChipTransport lang={lang} />
    </div>
  );
}
