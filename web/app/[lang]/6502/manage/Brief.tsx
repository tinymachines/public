"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { SKILL_NAME, withToken } from "@/lib/brief-token";

/**
 * The brief with the key in it, made where the key is.
 *
 * The server serves the brief without the token (lib/brief.ts says why). This
 * fetches that text, puts the token on the one line left for it, and offers
 * it two ways: copied, to paste into a chat, or downloaded as SKILL.md, to
 * drop into a skills directory. The token never leaves the browser except
 * in the file the person chose to save.
 */

const L = {
  en: {
    eyebrow: "Hand it to an AI",
    title: "The brief, with your key in it",
    lede: "Everything an agent needs to build, run and publish a cart for your page, in one file. Your token is inside it, so treat the file as you would the token.",
    copy: "Copy the brief",
    copied: "Copied. Paste it into any chat as the first message.",
    download: "Download SKILL.md",
    installed: (n: string) => `Claude Code: save it as ~/.claude/skills/${n}/SKILL.md. Codex: as AGENTS.md beside your cart. Anything else: paste it in.`,
    withoutKey: "The same brief without the key, to share",
    loading: "assembling the brief",
    failed: "The brief could not be fetched; the link below still works.",
  },
  ja: {
    eyebrow: "AI に渡す",
    title: "あなたの鍵を入れたブリーフ",
    lede: "エージェントがあなたのページ向けにカートを作り、走らせ、公開するのに必要なすべてを一つのファイルに。中にトークンが入っているので、このファイルはトークンと同じように扱うこと。",
    copy: "ブリーフをコピー",
    copied: "コピーした。どのチャットでも最初のメッセージとして貼り付ける。",
    download: "SKILL.md をダウンロード",
    installed: (n: string) => `Claude Code: ~/.claude/skills/${n}/SKILL.md として保存。Codex: カートの隣に AGENTS.md として。それ以外: そのまま貼り付ける。`,
    withoutKey: "鍵なしの同じブリーフ (共有用)",
    loading: "ブリーフを組み立てている",
    failed: "ブリーフを取得できなかった。下のリンクはそのまま使える。",
  },
} as const;

export function Brief({ lang = "en", token, slug, handle }: { lang?: Lang; token: string; slug: string; handle: string | null }) {
  const S = L[lang];
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const q = `?slug=${encodeURIComponent(slug)}${handle ? `&handle=${encodeURIComponent(handle)}` : ""}`;

  useEffect(() => {
    let live = true;
    fetch(`/6502/cart/skill.md${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => { if (live) setText(withToken(t, token)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [q, token]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch { /* no clipboard: the download is the other door */ }
  }

  function download() {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "SKILL.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card brief-card">
      <p className="eyebrow">{S.eyebrow}</p>
      <h3>{S.title}</h3>
      <p className="note">{S.lede}</p>
      <div className="row">
        <button type="button" className="go" disabled={!text} onClick={copy}>{S.copy}</button>
        <button type="button" className="filebtn" disabled={!text} onClick={download}>{S.download}</button>
      </div>
      {copied ? <p className="ok">{S.copied}</p> : null}
      {!text && !failed ? <p className="note">{S.loading}</p> : null}
      {failed ? <p className="err">{S.failed}</p> : null}
      <p className="note">{S.installed(SKILL_NAME)}</p>
      <p className="note">
        <a href={`/6502/cart/brief.md${q}`}>{S.withoutKey}</a>
      </p>
    </section>
  );
}
