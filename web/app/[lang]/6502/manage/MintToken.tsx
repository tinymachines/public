"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";

/**
 * The public mint, as a button on the editor.
 *
 * It asks the roof API (`GET /api/v1/tokens`) whether the mint is open and
 * how much of it is left for this address, then mints (`POST`) and does the
 * two things a person would do next by hand: shows the token, once, and puts
 * it in the editor's token field and presses "use it". The field and the
 * button are the editor's own markup (#token, #signin), which is the contract
 * manage.js was written against, so this touches nothing of theirs.
 *
 * What it will not do is pretend. A 429 says how long to wait; a 503 says the
 * mint is off on this deployment; and the token is rendered exactly once,
 * because nothing, here or on the server, can show it again.
 */

const L = {
  en: {
    eyebrow: "No token yet",
    title: "Mint a free token",
    lede: "One click. It is free, it is yours, and it is shown once: the registry keeps only its digest.",
    button: "Mint a free token",
    minting: "Minting",
    left: (n: number, per: number) => `${n} of ${per} left for your address today`,
    off: "The mint is not enabled on this deployment.",
    minted: "Your token. Copy it somewhere safe now; it will not be shown again. It has been placed in the field below and you are signed in.",
    limit: "Limit reached for your address today.",
    failed: "The mint did not answer.",
    note: "note (optional)",
    notePh: "who or what it is for",
  },
  ja: {
    eyebrow: "トークンがまだ無い",
    title: "無料のトークンを鋳造する",
    lede: "ワンクリック。無料で、あなたのもので、表示は一度きり: レジストリが持つのはそのダイジェストだけだ。",
    button: "無料のトークンを鋳造",
    minting: "鋳造中",
    left: (n: number, per: number) => `このアドレスで今日あと ${n} / ${per}`,
    off: "このデプロイでは鋳造が有効になっていない。",
    minted: "あなたのトークン。今すぐ安全な場所に控えること。二度と表示されない。下の欄に入れてサインイン済みだ。",
    limit: "このアドレスの今日の上限に達した。",
    failed: "鋳造所が応答しなかった。",
    note: "メモ (任意)",
    notePh: "誰の、何のためか",
  },
} as const;

interface Avail { enabled: boolean; per_ip_per_day: number; remaining_for_you: number }

export function MintToken({ lang = "en" }: { lang?: Lang }) {
  const S = L[lang];
  const [avail, setAvail] = useState<Avail | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/v1/tokens", { signal: stop.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setAvail(j))
      .catch(() => {});
    return () => stop.abort();
  }, []);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(r.status === 429 ? `${S.limit} ${j.detail ?? ""}` : r.status === 503 ? S.off : `${S.failed} (${r.status})`);
        return;
      }
      setToken(j.token);
      // Hand it to the editor: its own field, its own button.
      const field = document.querySelector<HTMLInputElement>("#token");
      const go = document.querySelector<HTMLButtonElement>("#signin");
      if (field && go) {
        field.value = j.token;
        go.click();
      }
      setAvail((a) => (a ? { ...a, remaining_for_you: Math.max(0, a.remaining_for_you - 1) } : a));
    } catch {
      setError(S.failed);
    } finally {
      setBusy(false);
    }
  }

  const can = !!avail && avail.enabled && avail.remaining_for_you > 0 && !busy && !token;

  return (
    <section className="card" id="mint">
      <p className="eyebrow">{S.eyebrow}</p>
      <h2>{S.title}</h2>
      <p className="note">{S.lede}</p>
      {token ? (
        <>
          <p className="ok">{S.minted}</p>
          <pre className="mint-token"><code>{token}</code></pre>
        </>
      ) : (
        <div className="row">
          <input
            className="input"
            aria-label={S.note}
            placeholder={S.notePh}
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: "1 1 14rem" }}
          />
          <button type="button" className="go" disabled={!can} onClick={mint}>
            {busy ? S.minting : S.button}
          </button>
        </div>
      )}
      {avail && avail.enabled ? (
        <p className="note">{S.left(avail.remaining_for_you, avail.per_ip_per_day)}</p>
      ) : avail && !avail.enabled ? (
        <p className="err">{S.off}</p>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
    </section>
  );
}
