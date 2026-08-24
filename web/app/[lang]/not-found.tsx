import Link from "next/link";

/**
 * The house 404, replacing Next's unstyled default.
 *
 * Bilingual in one page rather than per-language, and not by choice: Next
 * renders a not-found boundary with no props, so this component cannot know
 * which language the missing URL was asked for in. Both languages on one page
 * is the honest shape of that constraint. The [lang] layout above still sets
 * the html lang from the URL, so the chrome is right even though this body
 * carries both.
 *
 * No Shell: the Shell's menu and crumbs describe a page that exists, and this
 * is precisely not one. A heading, the fact, and the way home.
 */
export default function NotFound() {
  return (
    <main className="page prose" style={{ paddingTop: "calc(var(--u) * 12)" }}>
      <h1>404</h1>
      <p>
        There is no page at this address. Nothing was ever here, or the thing
        that was has moved and this URL was not in the redirect map, which
        would be worth telling us about.
      </p>
      <p lang="ja">このアドレスにページはありません。</p>
      <p>
        <Link href="/">tinymachines.ai</Link>
        {" · "}
        <Link href="/ja">日本語</Link>
      </p>
    </main>
  );
}
