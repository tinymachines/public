# Faces for the link cards

The card a link unfurls into (`web/lib/card.tsx`) is drawn on the server by
Satori, which reads TTF and WOFF and not woff2. These are the same families
the site serves from `../`, in containers it can read:

| file | from |
|---|---|
| `Archivo-700-latin.ttf`, `Archivo-700-latin-ext.ttf` | `../Archivo-700-*.woff2`, which are variable fonts: instantiated at wght 700, wdth 100 |
| `IBMPlexSans-400-latin.ttf` | `../IBMPlexSans-400-latin.woff2`, a variable font: instantiated at wght 400 |
| `IBMPlexMono-400-latin.ttf` | `../IBMPlexMono-400-latin.woff2`, static |
| `NotoSansJP-Bold.woff` | Noto Sans CJK JP Bold (SIL OFL 1.1), subset to ASCII, the kana and symbol blocks (U+3000 to U+30FF), the halfwidth and fullwidth forms, and every CJK unified ideograph (U+4E00 to U+9FFF); layout tables and hinting dropped |

The pages themselves have no Japanese face and leave it to the reader's
system. A server has no system face to fall back to, which is why the one
Japanese file exists, and why it is a subset rather than the 16 MB original.
`data/check-og-font.py` fails the build on any Japanese character in the
shipped copy that the subset cannot draw.

To remake them, with `fonttools` and `brotli` installed:

```
python3 - <<'EOF'
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
o = subset.Options(); o.layout_features = []; o.hinting = False; o.notdef_outline = True; o.name_IDs = [1, 2, 4, 6]
for n, w in [("Archivo-700-latin", 700), ("Archivo-700-latin-ext", 700), ("IBMPlexSans-400-latin", 400), ("IBMPlexMono-400-latin", 400)]:
    f = TTFont(f"style/fonts/{n}.woff2"); f.flavor = None
    if "fvar" in f:   # Google serves these as variable fonts; the renderer wants one instance
        loc = {"wght": w}
        if any(a.axisTag == "wdth" for a in f["fvar"].axes): loc["wdth"] = 100
        f = instancer.instantiateVariableFont(f, loc)
    s = subset.Subsetter(o); s.populate(unicodes=list(range(0x20, 0x250)) + [0x2010, 0x2013, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x00B7, 0x00D7]); s.subset(f)
    f.save(f"style/fonts/og/{n}.ttf")
o = subset.Options(); o.flavor = "woff"; o.layout_features = []; o.hinting = False; o.desubroutinize = True; o.notdef_outline = True; o.name_IDs = [1, 2, 4, 6]
f = TTFont("NotoSansCJK-Bold.ttc", fontNumber=0)   # face 0 is JP
u = list(range(0x20, 0x7F)) + list(range(0x3000, 0x3100)) + list(range(0x4E00, 0xA000)) + list(range(0xFF00, 0xFFF0)) + [0x2010, 0x2013, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x00B7, 0x00D7, 0x00A0]
s = subset.Subsetter(o); s.populate(unicodes=u); s.subset(f); f.save("style/fonts/og/NotoSansJP-Bold.woff")
EOF
```
