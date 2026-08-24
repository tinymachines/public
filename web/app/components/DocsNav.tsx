"use client";

import Link from "next/link";
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
 */
export function DocsNav({ nodes, root }: { nodes: TreeNode[]; root: { route: string; title: string } }) {
  const { lang, path: here } = delocalize(usePathname() ?? "/");

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
    <nav className="tree" aria-label="Documentation">
      <div className="sect">Documentation</div>
      <Link href={localize(lang, root.route)} aria-current={here === root.route ? "page" : undefined}>
        {root.title}
      </Link>
      <List items={nodes} depth={1} />
    </nav>
  );
}
