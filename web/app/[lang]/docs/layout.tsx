import type { Lang } from "@/lib/lang";
import { docsTree, rootPage } from "@/lib/docs";
import type { TreeNode } from "@/lib/docs";
import { t } from "@/lib/i18n";
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
  // Localized HERE, on the server, because the nav is a client component and
  // t() reads the overlay off disk. The crumbs already spoke Japanese while
  // the sidebar did not, which was two names for one page on one screen.
  const loc = (n: TreeNode): TreeNode => ({
    ...n,
    page: { ...n.page, title: t(lang as Lang, n.page.title) },
    children: n.children.map(loc),
  });
  const bare = rootPage();
  const root = { ...bare, title: t(lang as Lang, bare.title) };
  const tree = docsTree().map(loc);

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
          <DocsNav nodes={tree} root={root} label={t(lang as Lang, "Documentation")} contents={lang === "ja" ? "目次" : "Contents"} />
        </div>
        <div className="docs-body prose">{children}</div>
      </div>
    </Shell>
  );
}
