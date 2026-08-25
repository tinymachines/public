"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import { Brief } from "./Brief";

/**
 * The account: sign in with GitHub, and the tokens it holds.
 *
 * The editor itself (manage.js, upstream's) still works on a registry token
 * in its own field. What the account adds is a place a token comes FROM and
 * can be got back from: mint one here and it is handed to the editor's field
 * and button (the same contract MintToken uses); lose one and re-issue it,
 * which revokes the old in the registry and moves the page across.
 *
 * Where sign-in is not configured (`GET /api/v1/auth` says), this renders
 * nothing and the public mint below stands alone.
 */

interface MeToken { id: string; handle: string | null; pub: string; note: string; created_at: string; revoked_at: string | null }
interface Me {
  user: { id: string; handle: string; name: string; pic: string | null; provider: string; login: string };
  tokens: MeToken[];
  limits: { active_max: number; active: number; remaining: number };
}
interface Minted { token: string; slug: string; handle: string | null; page: string | null; play: string; brief: string; setup: string }

const L = {
  en: {
    eyebrow: "Your account",
    signInTitle: "Sign in with GitHub",
    signInLede: "An account holds your tokens, so a lost one can be replaced and your page kept. Nothing about the token is stored: only its digest.",
    signIn: "Sign in with GitHub",
    signedIn: (name: string, login: string) => `Signed in as ${name} (@${login} on GitHub).`,
    signOut: "sign out",
    tokens: "Your tokens",
    none: "No tokens yet. Mint one below and it is handed to the editor.",
    live: "live",
    revoked: "revoked",
    page: "page",
    noPage: "no page yet",
    reissue: "re-issue",
    reissueTitle: "Revoke this token in the registry and move its page to a new one, shown once",
    revoke: "revoke",
    revokeTitle: "Stop this token working. The page stays.",
    mint: "Mint a token",
    minting: "minting",
    handlePh: "a name for your page, or leave it and get your cart code",
    notePh: "what it is for (optional)",
    left: (n: number, max: number) => `${n} of ${max} live tokens still to mint on this account.`,
    minted: "Your token. Copy it somewhere safe now; it will not be shown again. It is in the editor below, and your page is claimed.",
    yourCode: "Your cart code",
    yourPage: "Your page",
    play: "Play the starter cart",
    failed: "That did not work.",
    sure: "Re-issue? The current token stops working the moment the new one exists.",
  },
  ja: {
    eyebrow: "アカウント",
    signInTitle: "GitHub でサインイン",
    signInLede: "アカウントはトークンを保持するので、なくしても差し替えてページを保てる。トークンそのものは保存されず、ダイジェストだけ。",
    signIn: "GitHub でサインイン",
    signedIn: (name: string, login: string) => `${name} (GitHub の @${login}) としてサインイン中。`,
    signOut: "サインアウト",
    tokens: "あなたのトークン",
    none: "トークンはまだない。下で鋳造すると、エディタに渡される。",
    live: "有効",
    revoked: "失効",
    page: "ページ",
    noPage: "ページはまだない",
    reissue: "再発行",
    reissueTitle: "このトークンをレジストリで失効させ、ページを新しいトークンへ移す (一度だけ表示)",
    revoke: "失効させる",
    revokeTitle: "このトークンを止める。ページは残る。",
    mint: "トークンを鋳造",
    minting: "鋳造中",
    handlePh: "ページの名前。空ならカートコードになる",
    notePh: "用途 (任意)",
    left: (n: number, max: number) => `このアカウントであと ${n} / ${max} 個鋳造できる。`,
    minted: "あなたのトークン。今すぐ安全な場所にコピーする。二度と表示されない。下のエディタに入っており、ページは取得済み。",
    yourCode: "カートコード",
    yourPage: "あなたのページ",
    play: "スターターのカートで遊ぶ",
    failed: "うまくいかなかった。",
    sure: "再発行する? 新しいトークンができた瞬間に、今のトークンは使えなくなる。",
  },
} as const;

function handToEditor(token: string) {
  const field = document.querySelector<HTMLInputElement>("#token");
  const go = document.querySelector<HTMLButtonElement>("#signin");
  if (field && go) {
    field.value = token;
    go.click();
  }
}

export function Account({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const [github, setGithub] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [minted, setMinted] = useState<Minted | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/v1/me", { cache: "no-store" });
    setMe(r.ok ? ((await r.json()) as Me) : null);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const a = await fetch("/api/v1/auth", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { github: false })).catch(() => ({ github: false }));
      if (!live) return;
      setGithub(!!a.github);
      if (a.github) await refresh();
    })();
    return () => { live = false; };
  }, [refresh]);

  async function post(path: string, body?: unknown): Promise<Response> {
    return fetch(path, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function mint() {
    setBusy(true); setError(null);
    try {
      const r = await post("/api/v1/me/tokens", handle.trim() ? { note, handle: handle.trim() } : { note });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.detail ?? `${S.failed} (${r.status})`); return; }
      setMinted(j);
      handToEditor(j.token);
      await refresh();
    } catch { setError(S.failed); } finally { setBusy(false); }
  }

  async function reissue(t: MeToken) {
    if (!window.confirm(S.sure)) return;
    setBusy(true); setError(null);
    try {
      const r = await post(`/api/v1/me/tokens/${t.id}/reissue`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.detail ?? `${S.failed} (${r.status})`); return; }
      setMinted(j);
      handToEditor(j.token);
      await refresh();
    } catch { setError(S.failed); } finally { setBusy(false); }
  }

  async function revoke(t: MeToken) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/v1/me/tokens/${t.id}`, { method: "DELETE" });
      if (!r.ok) setError(`${S.failed} (${r.status})`);
      await refresh();
    } catch { setError(S.failed); } finally { setBusy(false); }
  }

  async function signOut() {
    await post("/api/v1/auth/logout");
    setMe(null); setMinted(null);
  }

  if (github === null || github === false) return null;

  const here = typeof window !== "undefined" ? window.location.pathname : "/6502/manage";

  if (!me) {
    return (
      <section className="card" id="account">
        <p className="eyebrow">{S.eyebrow}</p>
        <h2>{S.signInTitle}</h2>
        <p className="note">{S.signInLede}</p>
        <p className="row">
          <a className="go" href={`/api/v1/auth/github?next=${encodeURIComponent(here)}`}>{S.signIn}</a>
        </p>
      </section>
    );
  }

  const can = me.limits.remaining > 0 && !busy;
  return (
    <section className="card" id="account">
      <p className="eyebrow">{S.eyebrow}</p>
      <h2>{S.tokens}</h2>
      <p className="note acct-who">
        {me.user.pic ? <img className="acct-pic" src={me.user.pic} alt="" width={28} height={28} /> : null}
        {S.signedIn(me.user.name, me.user.login)}{" "}
        <button type="button" className="linkish" onClick={signOut}>{S.signOut}</button>
      </p>

      {me.tokens.length ? (
        <table className="acct-tokens">
          <tbody>
            {me.tokens.map((t) => (
              <tr key={t.id} className={t.revoked_at ? "dead" : ""}>
                <td><code>{t.pub}…</code></td>
                <td>{t.handle ? <a href={`/6502/builders/${t.handle}`}>@{t.handle}</a> : <span className="quiet">{S.noPage}</span>}</td>
                <td>{t.revoked_at ? S.revoked : S.live}</td>
                <td>
                  {t.revoked_at ? null : (
                    <>
                      <button type="button" className="filebtn" title={S.reissueTitle} disabled={busy} onClick={() => reissue(t)}>{S.reissue}</button>{" "}
                      <button type="button" className="filebtn" title={S.revokeTitle} disabled={busy} onClick={() => revoke(t)}>{S.revoke}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note">{S.none}</p>
      )}

      {minted ? (
        <>
          <p className="ok">{S.minted}</p>
          <pre className="mint-token"><code>{minted.token}</code></pre>
          <p className="note">
            <b>{S.yourCode}:</b> <code>{minted.slug}</code>
            {minted.page ? <>{" · "}<b>{S.yourPage}:</b> <a href={minted.page}>{minted.page.replace("https://tinymachines.ai", "")}</a></> : null}
          </p>
          <p className="note">{minted.setup}</p>
          <p className="piece-links"><a className="tag live" href={minted.play}>{S.play}</a></p>
          <Brief lang={lang} token={minted.token} slug={minted.slug} handle={minted.handle} />
        </>
      ) : null}

      <div className="row">
        <input className="input" aria-label={S.handlePh} placeholder={S.handlePh} maxLength={32} value={handle} onChange={(e) => setHandle(e.target.value)} style={{ flex: "1 1 12rem" }} />
        <input className="input" aria-label={S.notePh} placeholder={S.notePh} maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: "1 1 14rem" }} />
        <button type="button" className="go" disabled={!can} onClick={mint}>{busy ? S.minting : S.mint}</button>
      </div>
      <p className="note">{S.left(me.limits.remaining, me.limits.active_max)}</p>
      {error ? <p className="err">{error}</p> : null}
    </section>
  );
}
