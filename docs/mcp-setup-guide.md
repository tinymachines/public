---
title: MCP, for clients and for servers
description: "How to connect a client to tinymachines.ai/api/mcp (claude.ai, Claude desktop, Claude Code, curl) and what it offers: four tools and the tm:// namespace; and how this server is built, so a server of your own speaks the same way."
order: 33
---

# MCP, for clients and for servers

tinymachines.ai speaks the Model Context Protocol at one public URL:

```
https://tinymachines.ai/api/mcp
```

It is read-only, needs no account and no key, and answers two kinds of
question. The **tools** say what tinymachines is and which of its pieces are
answering right now, measured when you ask. The **resources** are a `tm://`
namespace: this site's documentation, data and design notes as files, and its
pages as a visitor gets them, with typed links between a page and the
markdown it is rendered from. The spec behind the namespace is in the
repository at `notes/tm-protocol-spec.md`; this page is the practical side.

The first half is for a client. The second half is for anyone building a
server, ours included.

## For clients

### Connect

The endpoint is Streamable HTTP: one `POST` per message, JSON-RPC 2.0 in
the body, no session to open and no event stream to hold. Most clients
need only the URL.

**claude.ai and Claude desktop.** Add a custom connector and give it the
URL above. No authentication is asked for, so leave that off. Desktop
shares the connectors of the account it is signed in to.

**Claude Code.** One command registers it for the project you are in:

```
claude mcp add --transport http tinymachines https://tinymachines.ai/api/mcp
```

`claude mcp list` shows it, and `/mcp` inside a session shows what it
offers. The flags are the ones at the time of writing; `claude mcp add
--help` is the authority.

**Any other client that takes a JSON configuration.** The shape is the
usual one:

```json
{
  "mcpServers": {
    "tinymachines": {
      "url": "https://tinymachines.ai/api/mcp"
    }
  }
}
```

**curl**, for a look at what the client will see. Initialize, then list:

```
curl -s https://tinymachines.ai/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

curl -s https://tinymachines.ai/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

The initialize answer carries `instructions`, a short orientation written for
the model, and `capabilities`, which say that tools, resources and
completions are all here. A `GET` on the URL answers with a refusal naming
`POST`, because there is no stream to open.

### What is on offer

Four tools:

| tool | what it answers |
|---|---|
| `overview` | the six pieces of the 6502 work, each with what it is, where its source is and its licence, and whether its public surface is up, measured at call time |
| `piece` | one piece by key, with the same measurement |
| `licensing` | what may be published and under what terms, which is not one licence |
| `resolve` | one `tm://` URI, read, with its links in the body; the tool-shaped door into the namespace below |

And the namespace, as MCP resources. The grammar is one host and three
mounts:

```
tm://tinymachines/                                 the mounts
tm://tinymachines/fs/docs/nes/pile.md              a file of the site's checkout
tm://tinymachines/fs/docs/nes/                     a directory; reading it lists it
tm://tinymachines/git/nes-bench/docs/pile.md       the same file in the repository
                                                   it was pulled from, at HEAD
tm://tinymachines/git/public/docs/words.md?at=v1.0&as=blame
                                                   a file at a tag, a commit per line
tm://tinymachines/http/tinymachines.ai/docs/nes/pile?as=text
                                                   the page that file becomes, as text
```

A URI ending in `/` is a collection, and reading one returns its children
with a cursor. Everything after the mount is the backend's own path. A
representation is a query parameter, never a path suffix: `?as=stat` is the
metadata of the same thing, `?as=text` a page's readable text (which is also
what a page gives with no parameter at all), `?as=rendered` the HTML with the
headers a visitor gets.

The git mount offers the site's own repository and the ones beside it that
the notebook pulls pages from, all public on GitHub under the same names.
`?at=` is a branch, tag or commit, `?as=log` the commits touching a path
(`&n=` how many), `?as=blame` the file with a commit per line, `?as=tree` a
directory as JSON. For `6502` the default ref is the commit the site is
serving, not the newest.

Every read carries links. A notebook page links to the markdown it is
rendered from (`tm:source`), the markdown links back to its page
(`tm:renders-as`); a page the build pulled from another repository, and its
copy here, link to the file they came from (`tm:generated-by`) and that file
links forward (`tm:generates`); a file here and the same file in git are
joined both ways (`tm:repository`, `tm:working-copy`); any page links to
the route file that renders it (`tm:source`) and to the records its own
code reads (`tm:data`), a record links back to its readers
(`tm:read-by`) and to the script that writes it (`tm:generated-by`); and
`up`, `collection`, `alternate`, `describedby`, `version-history` and
`latest-version` mean what the IANA registry says. Through resources the links sit in the
result's `_meta` under `tinymachines.ai/links`; through `resolve` they are in
the body.

A URI that does not resolve is refused with the nearest ones that do, so a
wrong guess teaches rather than dead-ends. A file over the size cap comes
back with its size and a `?range=` template. The resource templates say the
grammar and completions fill in live values, so a client can compose a URI
it was never shown and try it.

### A first session

Six exchanges take a client from a cold connection to the source file behind
a page, without guessing a path:

1. `initialize`: the capabilities and the orientation.
2. `resources/templates/list`: the four templates, root, fs, git and http.
3. Read `tm://tinymachines/http/tinymachines.ai/docs/nes/`: the notebook's
   NES section, page by page.
4. `completion/complete` on the fs template's `path` with `docs/nes/pi`
   typed: the files that start that way.
5. Read `tm://tinymachines/http/tinymachines.ai/docs/nes/pile?as=text`: the
   page's text, and a `tm:source` link.
6. Read that link: the markdown, with its own link back to the page, to the
   directory it sits in, and to the file in the bench repository it was
   pulled from, whose `?as=log` is its history.

Through the `resolve` tool, the same six steps are calls with a `uri`
argument, and the links come back in the body.

### The other endpoint

The chip itself is not behind this URL. Running 6502 code, assembling and
minting cartridges is the 6502 API's job, which has its own endpoint at
`https://6502.tinymachines.ai/api/mcp` and its own tools. The `overview` tool
here names it, and the two are designed to be connected together.

## For servers

This section is how ours is built, so that a server of your own speaks the
same way, and so that a change to ours lands in the right place. The code is
`api/mcp_server.py` (the transport and the tools) and `api/tm.py` (the
namespace), with `api/test_tm.py` beside them.

### The transport is one POST

A conforming Streamable HTTP server needs very little:

- `POST` takes one JSON-RPC 2.0 message or a batch, and answers in kind.
  A batch comes back as a batch, in order.
- A notification (a message with no `id`, such as
  `notifications/initialized`) is answered with status `202` and no body.
- `GET` is where a client would open a server-to-client stream. With no
  server-initiated messages to send, ours answers `405` with `Allow: POST`
  and a sentence saying why.
- `initialize` echoes the client's `protocolVersion` when it is one the
  server supports and otherwise answers with the newest it speaks.
  Capabilities are declared here and nowhere else.
- A protocol error (unknown method, bad params) is a JSON-RPC error. A tool
  that refuses is a normal result with `isError: true` and a reason the
  model can read, because a JSON-RPC error is for the client, not the model.

The transport here is hand-written rather than an SDK. It is a short,
dependency-free thing with little in it to be wrong about, which matters for
a service whose promise is that nothing goes stale underneath it. An SDK is
the right choice when the server will do more than this one does
(subscriptions, sampling, a session).

### A tool is a description and an implementation, checked against each other

Each tool is a dictionary in `TOOLS` (name, title, description, input
schema) and a function in a table the handler is built with. The handler
asserts at construction that every advertised tool has an implementation
and every implementation is advertised, so the two cannot drift. The
description is written for the model: what the tool answers, what to call
first, and what an unknown argument gets (a refusal naming the valid ones,
never a guess).

The tools call the same functions the REST routes call. A tool that computed
its own answer would be a second surface pretending to be one.

### A mount is three operations

The namespace is a set of mounts behind one grammar, and adding a backend is
adding a mount; the protocol, the templates and the client do not change. A
mount implements:

| operation | input | output |
|---|---|---|
| `list` | a collection path and a cursor | children as URIs, each with a name, a type, a size where there is one, and whether it is a collection; a `nextCursor` when truncated |
| `read` | a leaf path and its representation | the content with its type, and the links |
| `complete` | a template argument and what was typed | candidate values, capped, with a `hasMore` flag |

and every mount inherits the same controls: paths are resolved before
anything touches the filesystem and refused when they land outside the
mount's roots; a read is capped in bytes and offers ranges beyond the cap;
a listing is paged; a deny-list of filename patterns is a second net, listed
as redacted so a client knows the file exists and does not get it.

Three of ours, and the reason each is shaped the way it is:

- **fs** offers three directories of the checkout that serves the site, the
  ones that are public on GitHub anyway. The roots are an allowlist, never
  the host, because this box holds a sign-in database and a gitignored
  hosting runbook, and no deny-list of names would catch them.
- **git** runs git itself, read-only, on repositories the server was told
  about, with every argument passed as an argument and never through a
  shell. A ref is checked against a pattern before it is used, so nothing a
  client names can be read as an option; a tree path is normalised and
  refused if it walks up. Which repository a pulled page came from is read
  from the pull scripts, which are the one copy of that fact, rather than
  kept as a second list.
- **http** fetches a page through nginx on loopback, with the site's name as
  SNI and as the `Host` header, so the bytes are what a visitor gets: the
  real certificate, the redirect map, the policy headers. The site has to be
  one this box serves, which is what keeps the mount from being an open
  proxy. `?as=text` takes the page's main element and leaves navigation out.

### Links are typed, both ways, with a confidence

Every read attaches links of the form `{rel, href, confidence?, title?}`.
Where the IANA registry has a relation, it is used and carries no
confidence, because it is exact by construction. The rest are `tm:`
relations and must say `exact`, `inferred` or `low`; the constructor asserts
that, so a link cannot get it wrong quietly. Inverse pairs are both emitted,
so a traversal can be walked in either direction, and every `href` is a
complete URI, never a relative path.

The page-to-source join is the one place a server needs to know how the
site is built. Ours restates the notebook loader's rule (a markdown path
under `docs/` becomes a `/docs/` URL, an index names its directory, `ja/` is
the language prefix), and the tests check the restatement against the
loader itself and against the last crawl of the served site. That check is
how two edge cases were found rather than assumed.

The data links are read off the tree the same way. A URL's route file
follows the app framework's convention; the records a page reads are the
data files named in its file and in the library modules it imports,
followed through the library only, so the site frame's menu and the
language tables are not counted as the page's reading; the writer of a
record is the script that names it. All of that is static reading of
source, so those links say `inferred`, and a record whose own note names
its writer is the one case that earns `exact`. A link's confidence is for
the client to weigh, which is why it is on every one of ours.

### What a refusal carries

A refusal is a JSON-RPC error whose `data.reason` a client can switch on:

| reason | what comes with it |
|---|---|
| `not-found` | up to five nearest URIs that do resolve |
| `out-of-root` | the roots that are offered |
| `denied` | nothing; the file exists and is not offered |
| `too-large` | the size, a `?range=` template, a `?as=stat` link |
| `binary` | the type and a `?as=stat` link |
| `redirect` | the status; the visitor would be sent on |
| `no-such-ref` | the refs that start the same way |
| `git-error` | git's own last line |
| `bad-facet`, `bad-cursor` | what was expected |

Through the `resolve` tool the same refusal is an `isError` result with
the same fields in its text, so a model sees the nearest URIs too.

### Testing a server

Ours runs under pytest in `api/`, and the tests that matter most are the
ones a fresh server should copy: a path can spell nothing that leaves the
roots (dotted segments, percent-encoded ones, a symlink out); a denied file
is listed as redacted and refused on read; the page rule agrees with the
thing that actually builds the pages; a wrong URI returns its nearest
siblings; and a handler built without the namespace advertises none of it.
A check that can pass on nothing is not a check, so each of these asserts
on a real refusal or a real list.

## What is not here yet

Not yet: subscriptions, and anything that writes. Writes are not
planned. The direction the spec reserves is proposals: a tool that takes a
URI a client wishes existed and stages a reviewable change, with nothing
landing without the owner's approval.
