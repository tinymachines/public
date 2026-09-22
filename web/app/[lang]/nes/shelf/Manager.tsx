"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { addCart, announceChange, deleteCart, deleteSave, fetchCart, kib, listShelf, patchCart, type Cart, type Shelf } from "@/lib/shelf";

/**
 * The shelf's manager: add, rename, annotate, download, delete.
 *
 * Every figure in a row is the server's measurement of the file (api/carts.py
 * reads the header and holds it to the file's length); nothing here computes
 * or restates one. A refusal is shown in the API's own words, which are
 * written to be read.
 */

const L = {
  en: {
    checking: "Looking for your shelf.",
    signedOutH: "Sign in to see your shelf",
    signedOut: "The shelf belongs to an account, so that your cartridges follow you from page to page and from one machine to the next.",
    signIn: "Sign in with GitHub",
    noSignIn: "Sign-in is switched off on this server, so there is no shelf here.",
    noShelfH: "This account's shelf is closed",
    noShelf: "Every account has a shelf unless we have closed it, and we have closed this one. What is on it is still yours to fetch or delete. Ask us if that seems wrong.",
    addH: "Add cartridges",
    add: "Choose .nes files",
    addHint: (max: string) => `As many at once as you like, ${max} each at most. Each file's header is read and checked against its length before it is kept.`,
    full: "The shelf is full. Delete one to add another.",
    held: (held: number, max: number) => `${held} of ${max} places used.`,
    added: "added",
    listH: "On your shelf",
    empty: "Nothing yet.",
    name: "Name",
    note: "Note",
    notePh: "anything worth remembering about this dump",
    mapper: "mapper",
    prg: "program",
    chr: "pictures",
    chrRam: "picture RAM",
    crc: "CRC-32",
    save: "save",
    download: "download",
    remove: "delete",
    saved: (bytes: string, when: string) => `save: ${bytes}, written ${when}`,
    noSave: "no save yet",
    forget: "forget the save",
    forgetSure: (name: string) => `Forget ${name}'s save? The next start is a cartridge whose battery was never written. The ROM stays.`,
    sure: (name: string) => `Delete ${name} from your shelf? The file is removed from the server. Your own copy is not touched.`,
    useH: "Where they turn up",
    use: "Every cartridge menu on the site offers these by name once you are signed in:",
    play: "the console you can play",
    playground: "the playground's benches",
  },
  ja: {
    checking: "棚を探している。",
    signedOutH: "サインインすると棚が見える",
    signedOut: "棚はアカウントに付く。だからカートリッジはページからページへ、機械から機械へとついてくる。",
    signIn: "GitHub でサインイン",
    noSignIn: "このサーバではサインインが切ってあるので、ここに棚はない。",
    noShelfH: "このアカウントの棚は閉じられている",
    noShelf: "棚はどのアカウントにもあるが、私たちが閉じることがあり、この棚は閉じてある。載っているものは今も取り出せるし消せる。おかしいと思ったら声をかけてほしい。",
    addH: "カートリッジを追加する",
    add: ".nes ファイルを選ぶ",
    addHint: (max: string) => `一度にいくつでも。一つあたり ${max} まで。どのファイルも、保存する前にヘッダを読み、長さと突き合わせる。`,
    full: "棚がいっぱいだ。一つ消せば追加できる。",
    held: (held: number, max: number) => `${max} 枠のうち ${held} 枠を使用中。`,
    added: "追加した",
    listH: "棚にあるもの",
    empty: "まだ何もない。",
    name: "名前",
    note: "メモ",
    notePh: "このダンプについて覚えておきたいこと",
    mapper: "マッパー",
    prg: "プログラム",
    chr: "絵",
    chrRam: "絵は RAM",
    crc: "CRC-32",
    save: "保存",
    download: "ダウンロード",
    remove: "削除",
    saved: (bytes: string, when: string) => `セーブ: ${bytes}、${when} に書き込み`,
    noSave: "セーブはまだない",
    forget: "セーブを忘れる",
    forgetSure: (name: string) => `${name} のセーブを忘れる? 次に起動するときは電池に何も書かれていないカートリッジになる。ROM は残る。`,
    sure: (name: string) => `${name} を棚から消す? サーバ上のファイルは削除される。手元のコピーには触れない。`,
    useH: "どこに現れるか",
    use: "サインインしていれば、サイト内のカートリッジを選ぶメニューすべてに名前で並ぶ:",
    play: "遊べるコンソール",
    playground: "プレイグラウンドの各ベンチ",
  },
} as const;

interface Outcome { file: string; ok: boolean; say: string }

function Row({ lang, cart, busy, onChanged, onError }: { lang: Lang; cart: Cart; busy: boolean; onChanged: () => Promise<void>; onError: (m: string | null) => void }) {
  const S = L[lang];
  const [name, setName] = useState(cart.name);
  const [note, setNote] = useState(cart.note);
  const [saving, setSaving] = useState(false);
  const dirty = name !== cart.name || note !== cart.note;

  async function save() {
    setSaving(true);
    onError(null);
    try {
      // Only what changed is named, because the route touches only what it is sent.
      await patchCart(cart.id, { ...(name !== cart.name ? { name } : {}), ...(note !== cart.note ? { note } : {}) });
      // The refreshed list re-keys this row, so its fields re-seed from the answer.
      await onChanged();
    } catch (e) {
      onError(String((e as Error).message ?? e));
      setSaving(false);
    }
  }

  async function download() {
    onError(null);
    try {
      const file = await fetchCart(cart);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(String((e as Error).message ?? e));
    }
  }

  async function forget() {
    if (!window.confirm(S.forgetSure(cart.name))) return;
    onError(null);
    try {
      await deleteSave(cart.id);
      await onChanged();
    } catch (e) {
      onError(String((e as Error).message ?? e));
    }
  }

  async function remove() {
    if (!window.confirm(S.sure(cart.name))) return;
    onError(null);
    try {
      await deleteCart(cart.id);
      await onChanged();
    } catch (e) {
      onError(String((e as Error).message ?? e));
    }
  }

  return (
    <li className="shelf-row" data-cart={cart.id}>
      <form
        className="shelf-row-edit"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void save();
        }}
      >
        <input className="input" aria-label={S.name} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} data-cart-name />
        <input className="input" aria-label={S.note} placeholder={S.notePh} value={note} maxLength={240} onChange={(e) => setNote(e.target.value)} data-cart-note />
        <button type="submit" className="btn" disabled={!dirty || busy || saving} data-cart-save>
          {S.save}
        </button>
      </form>
      <p className="shelf-row-facts" data-cart-facts>
        <span className="measured">{S.mapper} {cart.mapper}</span>
        <span className="measured">{S.prg} {kib(cart.prg_bytes)}</span>
        <span className="measured">{cart.chr_bytes ? `${S.chr} ${kib(cart.chr_bytes)}` : S.chrRam}</span>
        <span className="measured">{S.crc} <code>{cart.crc32}</code></span>
        <span className="measured" data-cart-kept={cart.save ? "kept" : "none"}>
          {cart.save ? S.saved(kib(cart.save.bytes), new Date(cart.save.saved_at).toLocaleString(lang === "ja" ? "ja" : "en")) : S.noSave}
        </span>
      </p>
      <p className="shelf-row-acts">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void download()} data-cart-download>{S.download}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()} data-cart-delete>{S.remove}</button>
        {cart.save ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void forget()} data-cart-forget>{S.forget}</button> : null}
      </p>
    </li>
  );
}

export function Manager({ lang }: { lang: Lang }) {
  const S = L[lang];
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [github, setGithub] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setShelf(await listShelf());
    announceChange();
  }, []);

  useEffect(() => {
    void (async () => {
      const a = await fetch("/api/v1/auth", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { github: false })).catch(() => ({ github: false }));
      setGithub(!!a.github);
      try {
        setShelf(await listShelf());
      } catch (e) {
        setError(String((e as Error).message ?? e));
        setShelf({ state: "signed-out" });
      }
    })();
  }, []);

  async function add(files: FileList) {
    setBusy(true);
    setError(null);
    const out: Outcome[] = [];
    // One at a time, so a full shelf stops at the file that did not fit and
    // every refusal is beside the file it is about.
    for (const file of [...files]) {
      try {
        const cart = await addCart(file);
        out.push({ file: file.name, ok: true, say: `${S.added}: ${cart.name}` });
      } catch (e) {
        out.push({ file: file.name, ok: false, say: String((e as Error).message ?? e) });
      }
      setOutcomes([...out]);
    }
    if (input.current) input.current.value = "";
    await refresh().catch((e) => setError(String((e as Error).message ?? e)));
    setBusy(false);
  }

  if (shelf === null) return <p className="prose shelf quiet" data-shelf-state="checking">{S.checking}</p>;

  if (shelf.state === "signed-out") {
    const here = typeof window !== "undefined" ? window.location.pathname : localize(lang, "/nes/shelf");
    return (
      <div className="prose shelf" data-shelf-state="signed-out">
        <h2>{S.signedOutH}</h2>
        {github ? (
          <>
            <p>{S.signedOut}</p>
            <p><a className="btn btn-primary" href={`/api/v1/auth/github?next=${encodeURIComponent(here)}`}>{S.signIn}</a></p>
          </>
        ) : (
          <p className="notice">{S.noSignIn}</p>
        )}
        {error ? <p className="notice fail" role="alert">{error}</p> : null}
      </div>
    );
  }

  const { carts, limits } = shelf;
  return (
    <div className="prose shelf" data-shelf-state={limits.max > 0 ? "open" : "no-shelf"}>
      {limits.max === 0 ? (
        <>
          <h2>{S.noShelfH}</h2>
          <p>{S.noShelf}</p>
        </>
      ) : (
        <>
          <h2>{S.addH}</h2>
          <p className="chips">
            <label className={"btn btn-primary" + (busy || limits.remaining === 0 ? " is-disabled" : "")}>
              {S.add}
              <input ref={input} type="file" accept=".nes" multiple hidden disabled={busy || limits.remaining === 0} onChange={(e) => e.target.files?.length && void add(e.target.files)} data-shelf-add />
            </label>
            <span className="measured" data-shelf-held>{S.held(limits.held, limits.max)}</span>
          </p>
          <p className="quiet">{limits.remaining === 0 ? S.full : S.addHint(kib(limits.bytes_max))}</p>
          {outcomes.length ? (
            <ul className="shelf-outcomes" data-shelf-outcomes>
              {outcomes.map((o, i) => (
                <li key={i} className={o.ok ? "ok" : "bad"} data-ok={o.ok}>
                  <code>{o.file}</code> {o.say}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {error ? <p className="notice fail" role="alert" data-shelf-error>{error}</p> : null}

      {limits.max > 0 || carts.length ? (
        <>
          <h2>{S.listH}</h2>
          {carts.length ? (
            <ul className="shelf-list" data-shelf-list>
              {carts.map((c) => (
                // Keyed by what the row shows as well as which it is, so a
                // saved rename re-seeds the fields from the server's answer.
                <Row key={`${c.id}:${c.updated_at}:${c.save?.saved_at ?? ""}`} lang={lang} cart={c} busy={busy} onChanged={refresh} onError={setError} />
              ))}
            </ul>
          ) : (
            <p className="quiet">{S.empty}</p>
          )}
        </>
      ) : null}

      {carts.length ? (
        <>
          <h2>{S.useH}</h2>
          <p>
            {S.use} <a href={localize(lang, "/nes/play")}>{S.play}</a>, <a href={localize(lang, "/nes/playground")}>{S.playground}</a>.
          </p>
        </>
      ) : null}
    </div>
  );
}
