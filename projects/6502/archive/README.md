# The archival drip

Pulls everything the Wayback Machine holds for **visual6502.org**, slowly.

Brought over from `tinymachines/6502` (`archive/tools/drip.py`), where it has
already run to completion once: **24,429 of 24,442 URLs, 3.01 GB, 23,958
distinct content blobs**, 471 URLs deduplicated by digest, at a measured ~15
URLs/min. The 13 that failed are 9 x HTTP 404 and 4 x HTTP 500, server side,
and a re-run fails on them identically. Those numbers are that run's. Nothing
in this repository has harvested anything.

The next run is not urgent, which is the point of the tool rather than a
caveat: the cheapest moment to collect something is before anybody has decided
it matters, and this is designed to sit for months and resume.

## Running it

```bash
python3 projects/6502/archive/drip.py --where            # where it would write
python3 projects/6502/archive/drip.py --fetch-index      # query the CDX API
python3 projects/6502/archive/drip.py                    # fetch, resumable
python3 projects/6502/archive/drip.py --status           # progress, ETA, failures
python3 projects/6502/archive/drip.py --limit 4 --delay 2   # a small bite
```

Ctrl-C is safe at any moment. State is one SQLite row per URL committed as it
goes, so a kill loses at most the request in flight. `nohup` it for a real run:
it is designed to survive the session, not the afternoon.

## Two things changed in the port

**The harvest is written outside the checkout.** `TM_ARCHIVE` names the
directory, `$STATE_DIRECTORY` is used under systemd, and it falls back to a
state directory under `$HOME`. The original wrote into `archive/wayback/`
beside the code, which was right in a repo where the archive tree was the
point. It is not right here: three gigabytes of somebody else's CC BY-NC-SA
content in a public working tree is one `git add -A` from being published, and
a `.gitignore` entry is a weaker guarantee than a path that was never inside
the tree. `test_drip.py` asserts the default resolves outside the repo.

**The index step is here, because it was missing.** The original reads
`cdx-full/*.json` and nothing in that repository produces them: the shards were
fetched by hand and committed, so a fresh clone had the data but not the means
to regenerate it. `--fetch-index` queries the CDX API with the paging the
Archive documents and writes the same shard format.

Verified rather than assumed: the first shard this produces has the same header
row and the same first data row as the shard the original consumed, character
for character.

    ['original', 'timestamp', 'mimetype', 'length', 'digest']
    ['http://visual6502.org:80/', '20100918234739', 'text/html', '2490', 'MS645ZOSY3RDXK6Y3HY2SF3R6YXRNFA2']

## One behaviour change, called out rather than slipped in

`safe_path` now replaces `/` along with the control characters and the
Windows-illegal set. The query string is appended to the last path component
**after** the split on `/`, so a MediaWiki subpage title containing a slash,
which MediaWiki allows and uses, silently became a directory and the file
landed one level deeper than the index believed. `test_drip.py` has the case,
and it fails against the original regex.

Any harvest made with the original is unaffected by this: those URLs are
recorded with the paths they were written to.

## What it does that is worth keeping

- **Resumable at any moment.** One SQLite row per URL, committed as it goes.
- **Content-addressed with hardlinks.** The CDX index carries a digest per
  capture, so bytes already held under another URL are hardlinked rather than
  refetched. On a wiki this is most of the corpus, because MediaWiki serves the
  same navigation chrome under thousands of URLs, and on a drip measured in
  requests per second, not fetching is the only real optimisation available.
- **Polite by construction.** One request at a time, a delay between each, and
  generous backoff on the 429s the Archive uses to push back. The Internet
  Archive is a charity preserving this material for everyone.
- **Failures are recorded, not fatal.** A URL that fails keeps its error and
  its attempt count and is retried by a later run without disturbing the rest.

Proved end to end against the live Archive with a four URL run rather than
asserted: 2 fetched, 1 hardlinked, 1 HTTP 404 recorded and not fatal. A second
run of the same four hardlinked 3 and refetched none.

## What may be done with what it collects

**Nothing is redistributed from this repository.** What comes down is
visual6502.org's own content: die photography, wikitext and the pages built on
them, under **CC BY-NC-SA 3.0**, and NonCommercial and ShareAlike travel with
it.

`NOTICE.md` records that `extern/visual6502` is a submodule in the 6502 repo
precisely so that repository does not redistribute NC-SA data, and says that
choice should not be quietly undone. Writing the harvest to a state directory
rather than into the tree is the same decision, made the same way, for the same
reason. Read `NOTICE.md` before publishing any of it.

## Tests

```bash
python3 -m pytest projects -q
```

Nothing here touches the network. What is worth testing is the part that has
actually gone wrong, and that is not the HTTP: it is turning 24,000 URLs into
24,000 filenames on a real filesystem, where a name can collide with a
directory, exceed 255 bytes, or contain a character the kernel refuses, and
where the same URL must map to the same name on a run resumed months later.
The original's first run died on the directory collision, and both orderings of
it are tested here because the whole point of the healing is that neither loses.
