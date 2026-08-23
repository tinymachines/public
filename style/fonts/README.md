# Vendored fonts

Committed on purpose. These are third-party assets, not build output: nothing
in this repository regenerates them, and `python3 build-tokens.py` does not
touch them. They are here so that a build and a page load both work with no
route to the internet.

## What is here

| Family | Weights | Role in STYLE.md section 3 |
|---|---|---|
| Archivo | 400, 600, 700, 800, 900 | `--font-display` |
| IBM Plex Sans | 400, 500, 600, 700 | `--font-sans` |
| IBM Plex Serif | 400, 600 | `--font-serif` |
| IBM Plex Mono | 400, 500, 600 | `--font-mono` |

28 files, around 695 KB. Two subsets per weight: `latin` and `latin-ext`.

**Greek, Cyrillic and Vietnamese are not included.** Text in those scripts
falls back to the stack in `tokens.css`. That is a size decision, and it is
stated because a gap that is not written down reads as coverage.

## Licence

Both families are under the **SIL Open Font License 1.1**.

- **Archivo**: Omnibus-Type. <https://github.com/Omnibus-Type/Archivo>
- **IBM Plex**: IBM. <https://github.com/IBM/plex>

The licences are here, one per family, taken from each project rather than
written out:

| | |
|---|---|
| `OFL-Archivo.txt` | Copyright 2020 The Archivo Project Authors |
| `OFL-IBMPlex.txt` | Copyright 2017 IBM Corp., with Reserved Font Name "Plex" |

**Both are the upstream files, not a generic copy of the licence.** That
distinction is the whole point. The OFL requires the copyright notice to travel
with the font, and IBM's carries a Reserved Font Name, which is a condition on
what a modified version may be called. A generic OFL text has neither line in
it, so shipping one would have satisfied the letter of "include the licence"
while dropping the part that names who is owed the attribution.

This directory previously recorded that obligation as outstanding rather than
guessing at it. That was the right call: the copyright lines above could not
have been written from memory correctly, and the Reserved Font Name in
particular would have been missed.

This is the same discipline `../../NOTICE.md` applies to the die data: the
terms travel with the artefact, and attribution is not decoration.

## Where they came from

Harvested from what `next/font/google` had already downloaded into the Next
build, rather than fetched again. They are the same subsetted woff2 files
Google serves, which is what `next/font` self-hosts.

Replacing a family means dropping new woff2 here, editing `../fonts.css`, and
changing the stack in `../tokens.css`. Nothing else refers to them.
