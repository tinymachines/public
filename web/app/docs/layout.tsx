import { docsTree, rootPage } from "@/lib/docs";
import { DocsNav } from "../components/DocsNav";
import { Shell } from "../components/SiteFrame";

/**
 * The docs shell: masthead, tree navigation, document.
 *
 * The navigation is still derived from the directory tree on every build. A
 * page that exists appears; a page that is deleted vanishes; neither takes an
 * edit here. What changed is that it now renders as the kit's .tree rather
 * than as a bare list, and marks where you are standing.
 */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  const root = rootPage();
  const tree = docsTree();

  return (
    <Shell die="6502" title="Documentation" crumb={<><b>tinymachines</b> / docs</>}>
      <div className="docs-shell">
        <div className="docs-nav">
          <DocsNav nodes={tree} root={root} />
        </div>
        <main className="docs-body prose">{children}</main>
      </div>
    </Shell>
  );
}
