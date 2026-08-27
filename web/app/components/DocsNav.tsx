"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { delocalize, localize } from "@/lib/lang";
import type { TreeNode } from "@/lib/docs";

/**
 * The docs navigation, using the kit's .tree.
 *
 * Two things changed here and both were already available. It renders as
 * .tree, which is the component components.css provides for exactly this, and
 * it marks the current page with aria-current, which .tree already styles with
 * a Burnt Silicon edge and a sunk ground. Before this the nav was eight
 * identical grey links with no indication of where you were standing.
 *
 * A client component only because it needs the pathname. The tree itself is
 * still derived on the server and passed in, so nothing about which pages
 * exist is decided in the browser.
 *
 * On a phone the tree waits behind a "Contents ›" button (owner's call,
 * 2026-08-28: twenty links, 633px of a 390px screen, before the first word
 * of the document). The button only exists below 60rem, by CSS, and the
 * tree is hidden there until it is pressed; on a desk the tree is the
 * sidebar it was, and no script runs to make it so. State, not <details>:
 * a details element cannot be open at one width and closed at another.
 */
export function DocsNav({
  nodes,
  root,
  label = "Documentation",
  contents = "Contents",
}: {
  nodes: TreeNode[];
  root: { route: string; title: string };
  label?: string;
  /** The phone button's word. */
  contents?: string;
}) {
  const { lang, path: here } = delocalize(usePathname() ?? "/");
  const [open, setOpen] = useState(false);
  // The layout persists across docs pages, so the state would too: a
  // reader who picked a page from the list gets the page, not the list.
  useEffect(() => { setOpen(false); }, [here]);

  function List({ items, depth }: { items: TreeNode[]; depth: number }) {
    return (
      <>
        {items.map((node) => (
          <div key={node.page.route} className={depth > 0 ? "d" : undefined}>
            <Link
              href={localize(lang, node.page.route)}
              aria-current={here === node.page.route ? "page" : undefined}
            >
              {node.page.title}
            </Link>
            {node.children.length > 0 && <List items={node.children} depth={depth + 1} />}
          </div>
        ))}
      </>
    );
  }

  return (
    <nav className={open ? "tree docs-toc open" : "tree docs-toc"} aria-label="Documentation">
      <button type="button" className="toc-btn" aria-expanded={open} aria-controls="docs-toc-list" onClick={() => setOpen((o) => !o)}>
        {contents}
      </button>
      <div id="docs-toc-list" className="toc-list">
      <div className="sect">{label}</div>
      <Link href={localize(lang, root.route)} aria-current={here === root.route ? "page" : undefined}>
        {root.title}
      </Link>
      <List items={nodes} depth={1} />
      </div>
    </nav>
  );
}
