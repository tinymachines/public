import Link from "next/link";
import { docsTree, rootPage, type TreeNode } from "@/lib/docs";

/**
 * The navigation, derived from the directory tree on every build.
 *
 * A page that exists appears here. A page that is deleted vanishes from here.
 * Neither takes an edit to this file, which is the entire point: a nav missing
 * one link still looks exactly like a nav, so the only safe nav is one nobody
 * maintains.
 */
function NavList({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.page.route}>
          <Link href={node.page.route}>{node.page.title}</Link>
          {node.children.length > 0 && <NavList nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  const root = rootPage();
  const tree = docsTree();

  return (
    <div className="docs-shell">
      <nav className="docs-nav" aria-label="Documentation">
        <Link href={root.route}>{root.title}</Link>
        <NavList nodes={tree} />
      </nav>
      <main className="docs-body prose">{children}</main>
    </div>
  );
}
