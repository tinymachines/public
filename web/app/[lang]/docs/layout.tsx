import type { Lang } from "@/lib/lang";
import { docsTree, rootPage } from "@/lib/docs";
import { DocsNav } from "@/app/components/DocsNav";
import { Shell } from "@/app/components/SiteFrame";

/**
 * The docs shell: masthead, tree navigation, document.
 *
 * The navigation is still derived from the directory tree on every build. A
 * page that exists appears; a page that is deleted vanishes; neither takes an
 * edit here. What changed is that it now renders as the kit's .tree rather
 * than as a bare list, and marks where you are standing.
 */
export default async function DocsLayout({ children, params }: LayoutProps<"/[lang]/docs">) {
  const { lang } = await params;
  const root = rootPage();
  const tree = docsTree();

  return (
    <Shell
      lang={lang as Lang}
      die="6502"
      title={lang === "ja" ? "ドキュメント" : "Documentation"}
      /* Every document carries its own title as an h1. */
      titleIsHeading={false}
    >
      <div className="docs-shell">
        <div className="docs-nav">
          <DocsNav nodes={tree} root={root} />
        </div>
        <main className="docs-body prose">{children}</main>
      </div>
    </Shell>
  );
}
