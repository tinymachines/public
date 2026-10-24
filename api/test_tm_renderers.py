"""The renderer registry (tinylens#3, spec section 15): one entry per media
type, naming the module that draws it by a tm:// address and its sha256, the
manifest it was built against, its fallback and the reads it is given. The
registry and the modules are files under notes/renderers/, the lens's."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import tm
from tm import ROOT, Namespace

from test_tm import canned_fetch, read, refusal, rels, repo, run  # noqa: F401  (repo is the fixture)

R = f"{ROOT}renderers/"
MODULE = b"export default function draw(msg) { return msg.uri; }\n"


def write_registry(repo: Path, module: bytes = MODULE, entries=None) -> None:
    d = repo / tm.RENDERERS_DIR
    d.mkdir(parents=True, exist_ok=True)
    (d / "pattern.js").write_bytes(module)
    (d / "blocks.js").write_bytes(b"export default 2;\n")
    reg = {"contract": "tinylens#3", "renderers": entries if entries is not None else [
        {"mimeType": tm.tm_type("pattern"), "name": "pattern", "what": "a pattern's numbers", "module": "pattern.js",
         "sha256": hashlib.sha256(MODULE).hexdigest(), "manifest": 1, "fallback": tm.T_RECORD, "reads": [{"set": "tm:instance"}]},
        {"mimeType": tm.T_RECORD, "name": "blocks", "what": "any thing as blocks", "module": "blocks.js",
         "sha256": hashlib.sha256(b"export default 2;\n").hexdigest(), "manifest": 1, "fallback": None, "reads": [{"as": "blocks", "media": True}]},
    ]}
    (d / "registry.json").write_text(json.dumps(reg, indent=1))


def ns_for(repo: Path) -> Namespace:
    return Namespace(repo, fetch=canned_fetch, git_repos={})


def test_the_registry_names_each_module_by_address(repo):
    write_registry(repo)
    n = ns_for(repo)
    c, links = read(n, R)
    assert c["mimeType"] == tm.T_RENDERERS
    body = json.loads(c["text"])
    pat = next(e for e in body["renderers"] if e["name"] == "pattern")
    assert pat["module"] == f"{R}pattern.js", "a module is an address, not a file beside a page"
    assert pat["reads"] == [{"set": "tm:instance"}] and pat["fallback"] == tm.T_RECORD and pat["manifest"] == 1
    r = rels(links)
    assert r["up"] == [ROOT]
    assert r["tm:data"] == [f"{ROOT}fs/{tm.RENDERERS_FILE}"]
    assert sorted(r["item"]) == [f"{R}blocks.js", f"{R}pattern.js"], "each module is reachable from the registry"
    _, back = read(n, f"{ROOT}fs/{tm.RENDERERS_FILE}")
    assert R in rels(back)["tm:read-by"]


def test_a_module_reads_as_itself_when_its_sha256_holds(repo):
    write_registry(repo)
    n = ns_for(repo)
    c, links = read(n, f"{R}pattern.js")
    assert c["mimeType"] == "text/javascript" and c["text"] == MODULE.decode()
    r = rels(links)
    assert r["collection"] == [R] and r["up"] == [R]
    assert r["tm:data"] == [f"{ROOT}fs/{tm.RENDERERS_DIR}/pattern.js"]
    st = json.loads(read(n, f"{R}pattern.js?as=stat")[0]["text"])
    assert st["sha256"] == hashlib.sha256(MODULE).hexdigest() and st["renders"] == tm.tm_type("pattern")
    _, back = read(n, f"{ROOT}fs/{tm.RENDERERS_DIR}/pattern.js")
    assert f"{R}pattern.js" in rels(back)["tm:read-by"]


def test_a_module_that_does_not_match_its_sha256_is_not_served(repo):
    write_registry(repo)
    (repo / tm.RENDERERS_DIR / "pattern.js").write_bytes(b"export default function draw() { fetch('/'); }\n")
    e = refusal(ns_for(repo), f"{R}pattern.js")
    assert e.reason == "not-found" and "sha256" in e.message, e.message


def test_a_module_the_registry_does_not_name_is_not_served(repo):
    write_registry(repo)
    (repo / tm.RENDERERS_DIR / "stray.js").write_bytes(b"1\n")
    assert refusal(ns_for(repo), f"{R}stray.js").reason == "not-found"
    assert refusal(ns_for(repo), f"{R}registry.json").reason == "not-found", "the registry is the collection, not a module"


def test_a_registry_with_a_bad_entry_is_refused_whole(repo):
    write_registry(repo, entries=[{"mimeType": "x", "name": "x", "module": "../escape.js", "sha256": "0" * 64}])
    e = refusal(ns_for(repo), R)
    assert e.reason == "not-found" and "module" in e.message, e.message


def test_no_registry_no_mount(repo):
    n = ns_for(repo)
    assert refusal(n, R).reason == "not-found"
    root = json.loads(read(n, ROOT)[0]["text"])
    assert "renderers" not in root, "nothing is offered that does not read"
    write_registry(repo)
    c, links = read(ns_for(repo), ROOT)
    assert json.loads(c["text"])["renderers"] == R
    assert R in rels(links)["describedby"]


def test_the_registry_is_a_kind_and_composes(repo):
    write_registry(repo)
    n = ns_for(repo)
    assert n.target_type(R) == tm.T_RENDERERS and n.target_type(f"{R}pattern.js") == "text/javascript"
    c, _ = read(n, R + "?as=blocks")
    assert json.loads(c["text"])["blocks"], "a host with no modules can still show the registry"
    assert any(t["uriTemplate"].startswith(f"{R}{{module}}") for t in n.templates())
