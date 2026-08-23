import Link from "next/link";
import { allPages } from "@/lib/docs";
import { Masthead, SiteNav, SiteFooter } from "./components/SiteFrame";

/**
 * The front page. Still a placeholder in the sense START-HERE.md section 4
 * means: what goes here, and in what order, is the owner's editorial call and
 * this does not attempt it.
 *
 * What it is no longer is unstyled. It uses the kit rather than a bare prose
 * block: masthead with the die, tags, a notice, and figures that are counted
 * rather than typed.
 */
export default function Home() {
  const pages = allPages();

  return (
    <main className="page">
      <Masthead
        die="6502"
        title="tinymachines"
        crumb="A transistor-level MOS 6502"
        meta={<SiteNav here="home" />}
      />

      <p className="prose">
        A transistor-level MOS 6502, and the things built on it. There is no
        instruction decoder here and no cycle-count table: there are 1725 wires
        and 3510 switches, and the behaviour falls out of simulating them.
      </p>

      <div className="chips">
        {/* Counted from the tree, not typed. Same rule as everywhere else:
            a figure in prose is written once against what was true that
            afternoon, and nothing checks it afterwards. */}
        <span className="measured">
          <b>{pages.length} documents</b> counted from docs/ at build
        </span>
      </div>

      <p className="notice">
        The front page proper is START-HERE.md step 4, and what goes on it is
        an editorial call this does not attempt. What is here stands the site
        up and proves the design system reaches it. The{" "}
        <Link href="/style/zoo">widget zoo</Link> is the normative reference
        for every component on this page.
      </p>

      <SiteFooter />
    </main>
  );
}
