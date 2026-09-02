"use client";

import { useCallback, useState } from "react";

/**
 * The admin console: sign in with a dev key, manage dev keys and people.
 *
 * ## Where the key lives, which is the only interesting decision here
 *
 * In a `useState`, and nowhere else. Not localStorage, not sessionStorage, not
 * a cookie. Closing the tab loses it and a reload asks again.
 *
 * That is a deliberate trade rather than an unfinished one. This site's CSP
 * carries `script-src 'unsafe-inline'`, because Next's app router inlines the
 * RSC payload on every page, and a long-lived admin credential sitting in a
 * storage API that any script on the origin can read is a worse thing to hold
 * than a re-paste is an inconvenience. The alternative that removes the
 * re-paste is a session cookie, and a session cookie needs a session table, an
 * expiry policy, a CSRF answer and a logout that invalidates something: four
 * decisions about how *users* sign in, which is a question nobody has answered
 * and which cannot be answered while nothing here can send mail.
 *
 * So the cost is a paste per tab, paid by one person, and nothing is at rest
 * in the browser.
 *
 * ## Everything drawn here is from the kit
 *
 * ../../style/components.css. .ledger for the tables, .field and .input for
 * the forms, .btn, .tag, .notice, .rail, .avatar. Nothing new is drawn, no
 * colour is chosen and no size is picked: a token change in the style guide
 * reaches this screen without touching this file.
 */

// ---------------------------------------------------------------------------
// The shapes the API returns. Kept to what this screen reads: openapi.json is
// the reference, and a second full copy of it in TypeScript would be exactly
// the drift the generated document exists to prevent.
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string;
  pub: string;
  scope: "dev" | "admin";
  note: string;
  user_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
}

interface User {
  id: string;
  email: string;
  handle: string;
  first_name: string;
  pic: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

interface WhoAmI {
  key: ApiKey;
  user: User | null;
  can_administer: boolean;
}

/** The four editable fields, which is exactly what a PATCH may name. */
type Editable = Pick<User, "first_name" | "handle" | "email" | "pic">;

// ---------------------------------------------------------------------------
// Talking to the API
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Turn a failure into one sentence a person can act on.
 *
 * FastAPI answers with two different shapes and flattening them to
 * "request failed" would throw away the half that says which field: an
 * HTTPException carries `detail` as a string, and a validation failure carries
 * it as a list of objects with the offending path in `loc`. Both are rendered,
 * because "handle: 2 to 32 characters" is a message somebody can fix and
 * "422 Unprocessable Entity" is not.
 */
function explain(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
        return field ? `${String(field)}: ${item.msg ?? "invalid"}` : String(item.msg ?? "invalid");
      })
      .join("; ");
  }
  return `The API answered ${status} and said nothing more.`;
}

async function call<T>(key: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Same origin, and nothing here wants a cached answer: a listing served
    // from the bfcache after a revoke would show the key still live.
    cache: "no-store",
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, explain(res.status, parsed));
  return parsed as T;
}

/**
 * UTC, to the minute, in the shape the ledger's other columns are in.
 *
 * Deliberately not toLocaleString: every stamp the API returns is UTC, and a
 * page that silently renders them in the reader's zone makes two admins on two
 * continents disagree about when a key was last used with nothing on screen
 * saying why.
 */
function stamp(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

// ---------------------------------------------------------------------------
// The console
// ---------------------------------------------------------------------------

export function AdminConsole() {
  const [key, setKey] = useState<string | null>(null);
  const [who, setWho] = useState<WhoAmI | null>(null);
  const [tab, setTab] = useState<"keys" | "users">("keys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (k: string) => {
    const [keyList, userList] = await Promise.all([
      call<{ keys: ApiKey[] }>(k, "GET", "/v1/admin/keys"),
      call<{ users: User[] }>(k, "GET", "/v1/admin/users"),
    ]);
    setKeys(keyList.keys);
    setUsers(userList.users);
  }, []);

  const refresh = useCallback(async () => {
    if (!key) return;
    setError(null);
    try {
      await load(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [key, load]);

  if (!key || !who) {
    return (
      <SignIn
        onSignedIn={(k, w) => {
          setKey(k);
          setWho(w);
          void load(k).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
        }}
      />
    );
  }

  return (
    <div className="prose">
      <Identity
        who={who}
        onSignOut={() => {
          // Dropping the state is the whole of signing out, because the state
          // is the whole of the session. There is nothing on the server to
          // invalidate and nothing in the browser to clear, which is the point
          // of keeping it in memory. Revoke the key to end it everywhere.
          setKey(null);
          setWho(null);
          setKeys([]);
          setUsers([]);
          setError(null);
        }}
      />

      {error ? <p className="notice fail" role="alert">{error}</p> : null}

      {!who.can_administer ? (
        <p className="notice">
          <b>This key can identify itself and nothing else.</b> Managing keys and
          people needs the <code>admin</code> scope; this one has{" "}
          <code>{who.key.scope}</code>.
        </p>
      ) : (
        <>
          {/* Toggle buttons, not an ARIA tablist. A real tablist owes the
              reader arrow-key navigation and a tabpanel per tab with
              aria-labelledby, and announcing the role without providing the
              behaviour is worse than not claiming it: a screen reader promises
              keys that do nothing. aria-pressed is what .chip already styles. */}
          <div className="chips">
            {(["keys", "users"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t === "keys" ? `Dev keys (${keys.length})` : `Users (${users.length})`}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
          </div>

          {tab === "keys" ? (
            <Keys
              apiKey={key}
              keys={keys}
              users={users}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
            />
          ) : (
            <Users
              apiKey={key}
              users={users}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

function SignIn({ onSignedIn }: { onSignedIn: (key: string, who: WhoAmI) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // whoami rather than the listing, because a screen that infers its own
      // permissions from whether some other request failed shows the wrong
      // thing whenever the failure has another cause.
      const who = await call<WhoAmI>(value.trim(), "GET", "/v1/admin/whoami");
      onSignedIn(value.trim(), who);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="prose">
      <form onSubmit={submit} style={{ maxWidth: "34rem" }}>
        <div className={error ? "field bad" : "field"}>
          <label htmlFor="admin-key">Dev key</label>
          <input
            className="input data"
            id="admin-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="tmk_"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="admin-key-hint"
          />
          <span className="hint" id="admin-key-hint">
            {error ?? "Held in this tab only. Nothing is written to the browser, so a reload asks again."}
          </span>
        </div>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>
            {busy ? "Checking" : "Sign in"}
          </button>
        </div>
      </form>

      <p className="quiet" style={{ marginTop: "2rem" }}>
        No key? The service mints one at startup whenever no live admin key
        exists, and prints it to the journal:{" "}
        <code>journalctl -u tinymachines-api</code>. It is printed once. Revoke
        every admin key and a restart mints another, which is the recovery path
        rather than a flag to remember.
      </p>
    </div>
  );
}

function Identity({ who, onSignOut }: { who: WhoAmI; onSignOut: () => void }) {
  return (
    <aside className="rail" style={{ marginBottom: "2rem" }}>
      <h3>Signed in</h3>
      <dl className="kv">
        <div>
          <dt>Key</dt>
          <dd>{who.key.pub}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>
            <span className={who.can_administer ? "tag live" : "tag"}>{who.key.scope}</span>
          </dd>
        </div>
        <div>
          <dt>Belongs to</dt>
          <dd>{who.user ? who.user.handle : "nobody"}</dd>
        </div>
      </dl>
      <div className="toolbar" style={{ marginTop: "1rem" }}>
        <button className="btn btn-ghost" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

interface PanelProps {
  apiKey: string;
  users: User[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  refresh: () => Promise<void>;
}

function Keys({ keys, ...p }: PanelProps & { keys: ApiKey[] }) {
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<"dev" | "admin">("dev");
  const [owner, setOwner] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const byId = new Map(p.users.map((u) => [u.id, u]));

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    p.setBusy(true);
    p.setError(null);
    setCopied(false);
    try {
      const made = await call<{ key: string }>(p.apiKey, "POST", "/v1/admin/keys", {
        scope,
        note,
        user_id: owner || null,
      });
      setMinted(made.key);
      setNote("");
      setOwner("");
      await p.refresh();
    } catch (err) {
      p.setError(err instanceof Error ? err.message : String(err));
    } finally {
      p.setBusy(false);
    }
  }

  async function revoke(k: ApiKey) {
    p.setBusy(true);
    p.setError(null);
    try {
      await call(p.apiKey, "DELETE", `/v1/admin/keys/${k.id}`);
      await p.refresh();
    } catch (err) {
      p.setError(err instanceof Error ? err.message : String(err));
    } finally {
      p.setBusy(false);
    }
  }

  return (
    <>
      <h2>Mint a key</h2>
      <form onSubmit={mint}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="k-note">Note</label>
            <input
              className="input"
              id="k-note"
              value={note}
              placeholder="who it is for"
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="hint">A key with no note is a key nobody can decide to revoke.</span>
          </div>
          <div className="field">
            <label htmlFor="k-scope">Scope</label>
            <select
              className="input data"
              id="k-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as "dev" | "admin")}
            >
              <option value="dev">dev</option>
              <option value="admin">admin</option>
            </select>
            <span className="hint">An admin key can mint and revoke keys, including its own.</span>
          </div>
          <div className="field">
            <label htmlFor="k-owner">Belongs to</label>
            <select className="input data" id="k-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">nobody</option>
              {p.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.handle}
                </option>
              ))}
            </select>
            <span className="hint">Optional. A key can exist before a person does.</span>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={p.busy}>
            Mint
          </button>
        </div>
      </form>

      {minted ? (
        <div style={{ marginTop: "1.5rem" }}>
          {/* The one place a key is ever on screen. Only its SHA-256 is stored,
              so nothing, including this page, can show it a second time: that
              is the property being protected and the copy says so plainly
              rather than leaving the reader to find out by reloading. */}
          <p className="notice">
            <b>Copy this now.</b> Only its digest is stored, so nothing can show
            it again. A lost key is replaced and revoked, not recovered.
          </p>
          <div className="code" style={{ marginTop: "0.75rem" }}>
            <div className="code-bar">
              <span>new key</span>
              <span>shown once</span>
            </div>
            <pre>{minted}</pre>
          </div>
          <div className="toolbar" style={{ marginTop: "0.75rem" }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(minted).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setMinted(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <h2>Keys</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="Dev keys">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Scope</th>
                <th>Note</th>
                <th>Belongs to</th>
                <th>Minted</th>
                <th>Last used</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const u = k.user_id ? byId.get(k.user_id) : undefined;
                return (
                  <tr key={k.id}>
                    <td>{k.pub}</td>
                    <td>{k.scope}</td>
                    <td className="name">{k.note || "no note"}</td>
                    <td>{u ? u.handle : k.user_id ? k.user_id : "nobody"}</td>
                    <td>{stamp(k.created_at)}</td>
                    <td>{stamp(k.last_used_at)}</td>
                    <td>
                      <span className={k.active ? "tag live" : "tag fail"}>
                        {k.active ? "live" : "revoked"}
                      </span>
                    </td>
                    <td>
                      {k.active ? (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ padding: "0.15rem 0.6rem", fontSize: "0.75rem" }}
                          disabled={p.busy}
                          onClick={() => void revoke(k)}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="quiet">{stamp(k.revoked_at)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>
            {keys.filter((k) => k.active).length} live of {keys.length}
          </span>
          <span>Revoked keys are kept: the row is the record that the key existed.</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const BLANK: Editable = { first_name: "", handle: "", email: "", pic: "" };

function Users({ users, ...p }: PanelProps) {
  const [draft, setDraft] = useState<Editable>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Editable>(BLANK);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    p.setBusy(true);
    p.setError(null);
    try {
      await call(p.apiKey, "POST", "/v1/admin/users", {
        email: draft.email,
        handle: draft.handle,
        first_name: draft.first_name,
        pic: draft.pic ? draft.pic : null,
      });
      setDraft(BLANK);
      await p.refresh();
    } catch (err) {
      p.setError(err instanceof Error ? err.message : String(err));
    } finally {
      p.setBusy(false);
    }
  }

  async function save(u: User) {
    p.setBusy(true);
    p.setError(null);
    try {
      // The PATCH carries only what actually changed. That is the API's rule
      // ("a PATCH touches only what it names") honoured by the client rather
      // than merely relied on: sending all four fields every time would work,
      // and would also mean two admins editing different fields of the same
      // row overwrite each other's work with stale values they never looked at.
      // Record rather than Partial<Editable>: `pic` is the only field that
      // may be null, so indexing a Partial<Editable> by a union key narrows
      // the value type to the intersection and rejects the null this is here
      // to send.
      const changes: Record<string, string | null> = {};
      (Object.keys(BLANK) as (keyof Editable)[]).forEach((field) => {
        const was = u[field] ?? "";
        const now = edit[field] ?? "";
        if (was !== now) {
          // An emptied picture is a removal, and null is how the API is told
          // that. The empty string would be a value.
          changes[field] = field === "pic" && now === "" ? null : now;
        }
      });
      if (Object.keys(changes).length) {
        await call(p.apiKey, "PATCH", `/v1/admin/users/${u.id}`, changes);
      }
      setEditing(null);
      await p.refresh();
    } catch (err) {
      p.setError(err instanceof Error ? err.message : String(err));
    } finally {
      p.setBusy(false);
    }
  }

  async function setDisabled(u: User, disabled: boolean) {
    p.setBusy(true);
    p.setError(null);
    try {
      await call(p.apiKey, "PUT", `/v1/admin/users/${u.id}/disabled`, { disabled });
      await p.refresh();
    } catch (err) {
      p.setError(err instanceof Error ? err.message : String(err));
    } finally {
      p.setBusy(false);
    }
  }

  const fields: [keyof Editable, string, string][] = [
    ["first_name", "First name", "Ada"],
    ["handle", "Handle", "ada"],
    ["email", "Email", "ada@example.org"],
    ["pic", "Picture", "/pics/ada.png"],
  ];

  return (
    <>
      <h2>Add a person</h2>
      <form onSubmit={create}>
        <div className="form-grid">
          {fields.map(([field, label, placeholder]) => (
            <div className="field" key={field}>
              <label htmlFor={`n-${field}`}>{label}</label>
              <input
                className={field === "first_name" ? "input" : "input data"}
                id={`n-${field}`}
                value={draft[field] ?? ""}
                placeholder={placeholder}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={p.busy}>
            Create
          </button>
          <span className="quiet" style={{ fontSize: "0.75rem" }}>
            Nothing is sent to the address. This service cannot send mail.
          </span>
        </div>
      </form>

      <h2>People</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="Users">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Handle</th>
                <th>Email</th>
                <th>Picture</th>
                <th>Joined</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) =>
                editing === u.id ? (
                  <tr key={u.id}>
                    <td colSpan={7}>
                      <div className="form-grid" style={{ padding: "0.5rem 0" }}>
                        {fields.map(([field, label]) => (
                          <div className="field" key={field}>
                            <label htmlFor={`e-${field}`}>{label}</label>
                            <input
                              className={field === "first_name" ? "input" : "input data"}
                              id={`e-${field}`}
                              value={edit[field] ?? ""}
                              onChange={(e) => setEdit({ ...edit, [field]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="toolbar" style={{ marginTop: "0.5rem" }}>
                        <button className="btn btn-primary" type="button" disabled={p.busy} onClick={() => void save(u)}>
                          Save
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        <span className="quiet" style={{ fontSize: "0.75rem" }}>
                          Only changed fields are sent. Emptying the picture removes it.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td className="name">
                      <span className="toolbar" style={{ gap: "0.5rem" }}>
                        <span className={u.disabled_at ? "avatar off" : "avatar"} aria-hidden="true">
                          {u.first_name.slice(0, 1)}
                        </span>
                        {u.first_name}
                      </span>
                    </td>
                    <td>{u.handle}</td>
                    <td>{u.email}</td>
                    <td>
                      {/* Shown as a link, never as an <img>. img-src here is
                          'self' data:, so a picture on another host is blocked
                          by the browser and renders as a broken image with no
                          error on the page: the quiet failure this repo keeps
                          a list of. The monogram in the name column is the
                          thing that can honestly be drawn. */}
                      {u.pic ? (
                        <a href={u.pic} rel="noreferrer noopener" target="_blank">
                          {u.pic.length > 32 ? `${u.pic.slice(0, 32)}...` : u.pic}
                        </a>
                      ) : (
                        <span className="quiet">none</span>
                      )}
                    </td>
                    <td>{stamp(u.created_at)}</td>
                    <td>
                      <span className={u.disabled_at ? "tag fail" : "tag live"}>
                        {u.disabled_at ? "disabled" : "active"}
                      </span>
                    </td>
                    <td>
                      <span className="toolbar" style={{ gap: "0.5rem" }}>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ padding: "0.15rem 0.6rem", fontSize: "0.75rem" }}
                          onClick={() => {
                            setEditing(u.id);
                            setEdit({
                              first_name: u.first_name,
                              handle: u.handle,
                              email: u.email,
                              pic: u.pic ?? "",
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ padding: "0.15rem 0.6rem", fontSize: "0.75rem" }}
                          disabled={p.busy}
                          onClick={() => void setDisabled(u, !u.disabled_at)}
                        >
                          {u.disabled_at ? "Restore" : "Disable"}
                        </button>
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>
            {users.filter((u) => !u.disabled_at).length} active of {users.length}
          </span>
          <span>Nothing here deletes a person. Disabling is reversible.</span>
        </div>
      </div>
    </>
  );
}
