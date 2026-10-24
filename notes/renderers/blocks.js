// tinylens panel: blocks. Built by scripts/build-panels.mjs from panels/src; do not edit.
(() => {
  // panel/runtime.js
  function panel(draw) {
    const post = (m) => parent.postMessage(m, "*");
    const send = {
      navigate: (href) => post({ type: "navigate", href }),
      select: (uri) => post({ type: "select", uri }),
      resize: (height) => post({ type: "resize", height }),
      ask: (uri, question) => post({ type: "ask", uri, question })
    };
    let last = -1;
    const measure = () => {
      const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (h !== last) {
        last = h;
        send.resize(h);
      }
    };
    new ResizeObserver(measure).observe(document.documentElement);
    addEventListener("message", (e) => {
      if (e.source !== parent || !e.data || typeof e.data !== "object" || typeof e.data.uri !== "string")
        return;
      draw(e.data, send);
      measure();
    });
    return send;
  }
  function linkTo(h, send, uri, text, cls) {
    return h(cls ? `a.${cls}` : "a", { href: "#", "data-uri": uri, text, title: uri, onclick: (e) => {
      e.preventDefault();
      send.navigate(uri);
    } });
  }

  // panels/src/panel.css
  var panel_default = `/* What every panel looks like: the family neutrals and faces, Violet as tinylens's
   own, and a page with no background of its own, so the host's card shows through.
   The blocks page's block styles (blocks/blocks.css) follow this in the bundle. */
:root {
  --bg: #f8f5f1; --surface: #fdfcf9; --line: #dcd9d3; --muted: #5e646a; --fg: #1d2227;
  --acc: #5f0fa7; --acc-soft: #ece4f7; --acc-line: #c7b3e3;
  --warn: #8a4b00; --warn-soft: #f6ead9; --focus: #41749d;
  --display: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --body: "Instrument Sans", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --r: 6px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #13161a; --surface: #1d2125; --line: #31363b; --muted: #a0a5ab; --fg: #f1eeea;
    --acc: #c9a6ff; --acc-soft: #292333; --acc-line: #503975; --warn: #f0b46a; --warn-soft: #322318;
    --focus: #83b4de; color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; color: var(--fg); font: 14px/1.45 var(--body); }
body { padding: 2px 0 6px; overflow: hidden; }
.quiet { color: var(--muted); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
#thing { background: transparent !important; border: 0 !important; padding: 0 !important; }
#thing p { margin: 0 0 8px; }

/* the compositions */
.lede { color: var(--fg) !important; font-size: 14px !important; margin: 0 0 12px !important; }
.lede p { margin: 0 0 6px; max-width: 70ch; }
.strip { margin: 0 0 12px; }
.strip h3 { margin: 0 0 2px !important; font-size: 13px !important; }
.strip svg { display: block; width: 100%; height: auto; overflow: visible; }
.strip .axis { stroke: var(--line); stroke-width: 1; }
.strip circle { fill: var(--acc); fill-opacity: .55; stroke: var(--acc); stroke-width: 1; }
.strip .ends { display: flex; justify-content: space-between; font: 11.5px var(--mono); color: var(--muted); }
.bars { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 3px; }
.bars li { display: grid; grid-template-columns: minmax(7em, 13em) 1fr 3.5em; gap: 8px; align-items: center; font-size: 13px; }
.bars .bar { height: 10px; background: var(--acc-soft); border: 1px solid var(--acc-line); border-radius: 3px; }
.bars .bar span { display: block; height: 100%; background: var(--acc); border-radius: 2px; }
.bars .n { font: 12px var(--mono); text-align: right; color: var(--muted); }
.frames { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 12px; }
.frames figure { margin: 0; }
.frames img { display: block; width: 128px; image-rendering: pixelated; border: 1px solid var(--line); border-radius: 4px; background: #000; }
.frames figcaption { font-size: 12px; color: var(--muted); }
.mark { font: 11px var(--mono); color: var(--muted); background: none; border: 1px dashed var(--line); border-radius: 99px; padding: 0 7px; cursor: pointer; }
.mark:hover { color: var(--acc); border-color: var(--acc-line); }
.ask-piece { display: flex; gap: 6px; margin: 4px 0 10px; }
.ask-piece[hidden] { display: none; }
.ask-piece input { flex: 1; min-width: 0; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 3px 8px; }
.ask-piece button { font: inherit; color: var(--surface); background: var(--acc); border: 1px solid var(--acc); border-radius: var(--r); padding: 3px 10px; cursor: pointer; }
.block:not(:hover):not(:focus-within) .mark { opacity: .35; }
`;

  // blocks/blocks.css
  var blocks_default = `/* The blocks page. The tokens, the bar, the start chips and the bends come from
   the lens's stylesheet (../src/lens.css); this is one column of blocks, set for
   reading, each block a type of its own. */

.blocks-page { max-width: 860px; margin: 18px auto 0; }
.lede { color: var(--muted); max-width: 70ch; margin: 0 0 18px; font-size: 14px; }
.toggle { display: inline-flex; gap: 6px; align-items: center; margin-left: 4px; color: var(--fg); white-space: nowrap; cursor: pointer; }
.toggle input { accent-color: var(--acc); }

#thing { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 18px clamp(14px, 3vw, 28px) 22px; min-width: 0; }
#thing a { color: var(--acc); text-decoration: underline; text-decoration-color: var(--acc-line); text-underline-offset: 2px; overflow-wrap: anywhere; }
#thing a:hover { text-decoration-color: var(--acc); }
#thing .addr { font: 12.5px var(--mono); }
.bend-meta .addr { font-family: var(--mono); color: var(--acc); }
.kind { margin: 0 0 4px; font: 600 12px var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.kind .addr { text-transform: none; letter-spacing: 0; font-weight: 400; }

.block { margin: 0 0 14px; min-width: 0; }
.block h1 { font: 700 clamp(24px, 4vw, 32px)/1.12 var(--display); letter-spacing: -.01em; margin: 0 0 6px; overflow-wrap: anywhere; }
.block h2, #thing > h2, .built h2 { font: 600 19px/1.2 var(--display); margin: 22px 0 6px; }
.block h3 { font: 600 16px/1.25 var(--display); margin: 16px 0 4px; }
#thing > h1 { font: 700 clamp(24px, 4vw, 32px)/1.12 var(--display); margin: 0 0 8px; overflow-wrap: anywhere; }
.block[data-type="heading"] { margin-bottom: 4px; }
.note { margin: 0; max-width: 70ch; }

/* where a block came from: hidden until asked for */
.from { display: none; margin: 4px 0 0; font-size: 11.5px; color: var(--muted); }
.show-from .from { display: block; }
.show-from .block { border-left: 2px solid var(--acc-line); padding-left: 10px; }

.kv { display: grid; grid-template-columns: minmax(8em, max-content) 1fr; gap: 3px 16px; margin: 0; }
.kv dt { color: var(--muted); overflow-wrap: anywhere; }
.kv dd { margin: 0; overflow-wrap: anywhere; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.num, dd.num { text-align: right; }
.kv dd.num { text-align: left; }

.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.items li { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; min-width: 0; }
.items li > a, .items li > span:first-child { overflow-wrap: anywhere; min-width: 0; }
.meta { display: inline-flex; flex-wrap: wrap; gap: 6px; font: 11.5px var(--mono); color: var(--muted); }
.meta span { border: 1px solid var(--line); border-radius: 99px; padding: 0 7px; }
.item-note { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--muted); }

.table-wrap { overflow-x: auto; max-width: 100%; }
table { border-collapse: collapse; font-size: 13.5px; min-width: 50%; }
caption { text-align: left; font: 600 12px var(--body); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding-bottom: 6px; }
th, td { border-bottom: 1px solid var(--line); padding: 4px 12px 4px 0; text-align: left; vertical-align: baseline; }
thead th { font-weight: 600; color: var(--muted); font-size: 12px; white-space: nowrap; }
.diff tbody th { font-weight: 400; }
.diff .same { color: var(--muted); font-size: 12px; }
.diff tr.differs th, .diff tr.differs td { background: var(--warn-soft); }
.diff tr.differs .same { color: var(--warn); font-weight: 600; }

.timeline { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--acc-line); display: grid; gap: 6px; }
.timeline time { display: block; font: 12px var(--mono); color: var(--muted); }

.code { margin: 0; }
.code figcaption { font: 11.5px var(--mono); color: var(--muted); margin-bottom: 4px; }
.code pre { margin: 0; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; overflow: auto; max-height: 32rem; font: 12.5px/1.5 var(--mono); white-space: pre; }

.block[data-type="media"] { display: inline-block; vertical-align: top; margin-right: 12px; }
.media { margin: 0; }

.media img[hidden] { display: none; }
.media img { display: block; max-width: min(100%, 256px); image-rendering: pixelated; border: 1px solid var(--line); border-radius: 4px; background: #000; }
.media figcaption { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.media-state { margin: 0; font-size: 12.5px; max-width: 24ch; }

.trail { margin: 0; padding-left: 1.4em; display: grid; gap: 6px; }
.trail li > span { display: block; font-size: 12px; }

.leads { border-top: 1px solid var(--line); padding-top: 4px; margin-top: 18px; }
.leads-head { font-size: 15px !important; }

.built { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 4px; }
.built h2 { font-size: 15px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 18px 0 0; font-size: 14px; }
.ask, .finding { margin: 0; }

@media (max-width: 560px) {
  .kv { grid-template-columns: 1fr; gap: 0 0; }
  .kv dd { margin-bottom: 6px; }
}

/* a thing drawn by its panel (tinylens#3): the module runs in a frame of its own */
.panel-slot { min-height: 40px; margin: 6px 0 4px; }
.panel-frame { width: 100%; border: 0; display: block; }
.panel-status { margin: 8px 0 0; font-size: 13px; }
.panel-status:empty { display: none; }
`;

  // panels/src/shell.js
  function start(draw) {
    const style = document.createElement("style");
    style.textContent = panel_default + `
` + blocks_default;
    document.head.append(style);
    const main = document.createElement("main");
    main.id = "thing";
    document.body.append(main);
    return panel((m, send) => {
      let nodes;
      try {
        nodes = draw(m, send);
      } catch (e) {
        nodes = [Object.assign(document.createElement("p"), { className: "quiet", textContent: `This panel could not draw ${m.uri}: ${e.message || e}` })];
      }
      main.replaceChildren(...[nodes].flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
    });
  }

  // src/dom.js
  function h(spec, attrs, ...kids) {
    const [tag, ...cls] = spec.split(".");
    const el = tag === "svg" || tag === "circle" || tag === "line" || tag === "rect" || tag === "title" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag || "div");
    if (cls.length)
      el.setAttribute("class", cls.join(" "));
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false)
        continue;
      if (k.startsWith("on"))
        el.addEventListener(k.slice(2), v);
      else if (k === "text")
        el.textContent = v;
      else
        el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity))
      if (k !== null && k !== undefined && k !== false)
        el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  var short = (uri) => uri.replace(/^tm:\/\/tinymachines\//, "");
  var fmt = (n) => typeof n === "number" ? n.toLocaleString("en-US") : String(n ?? "");

  // src/core.js
  function kindFromType(mimeType) {
    const t = String(mimeType || "").split(";")[0].trim().toLowerCase();
    const m = /^(?:application\/vnd\.tm\.([a-z0-9-]+)\+json|text\/vnd\.tm\.([a-z0-9-]+))$/.exec(t);
    return m ? m[1] || m[2] : null;
  }
  var IANA = new Set(["up", "collection", "alternate", "describedby", "version-history", "latest-version", "next"]);

  // blocks/vocab.js
  var BLOCKS_TYPE = "application/vnd.tm.blocks+json";
  var str = (v) => typeof v === "string";
  var scalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
  var addr = (v) => str(v) && v.startsWith("tm://");
  var VOCABULARY = {
    heading: (b) => !str(b.text) ? "has no text" : ![1, 2, 3].includes(b.level) ? `has level ${JSON.stringify(b.level)}, not 1 to 3` : null,
    note: (b) => !str(b.text) ? "has no text" : null,
    kv: (b) => !Array.isArray(b.rows) ? "has no rows" : b.rows.find((r) => !str(r.key) || !scalar(r.value)) ? "has a row whose value is not a scalar" : null,
    list: (b) => !Array.isArray(b.items) ? "has no items" : b.items.find((i) => !str(i.text)) ? "has an item with no text" : null,
    table: (b) => !Array.isArray(b.columns) || !Array.isArray(b.rows) ? "has no columns or rows" : b.rows.find((r) => !Array.isArray(r) || r.length !== b.columns.length) ? "has a row that does not fit its columns" : b.rows.find((r) => r.find((c) => !scalar(c))) ? "has a cell that is not a scalar" : b.hrefs && (!Array.isArray(b.hrefs) || b.hrefs.length !== b.rows.length) ? "has hrefs that are not one a row" : null,
    timeline: (b) => !Array.isArray(b.events) ? "has no events" : b.events.find((e) => !str(e.text)) ? "has an event with no text" : null,
    diff: (b) => !Array.isArray(b.rows) ? "has no rows" : b.rows.find((r) => !str(r.path) || typeof r.same !== "boolean") ? "has a row with no path or no same" : null,
    code: (b) => !str(b.text) ? "has no text" : null,
    media: (b) => !addr(b.href) ? "has no address" : !str(b.mimeType) ? "has no mimeType" : !str(b.alt) ? "has no alt" : null,
    question: (b) => !str(b.text) || !addr(b.href) ? "has no text or no address" : null,
    finding: (b) => !str(b.text) || !addr(b.href) ? "has no text or no address" : null,
    trail: (b) => !Array.isArray(b.steps) ? "has no steps" : b.steps.find((s) => !addr(s.href)) ? "has a step with no address" : null,
    link: (b) => !addr(b.href) ? "has no address" : !str(b.rel) ? "has no rel" : null
  };
  var RESERVED = new Set(["question", "finding"]);
  var bend = (kind, uri, note, { key = "", ...extra } = {}) => ({ ...extra, kind, key: `${kind}:${key}`, uri, note, where: "tinylens#2" });
  function mediaOf(asked, block, read) {
    if (!read || read.error) {
      return { bend: bend("media-refused", asked, `A picture's address does not read: ${block.href} is refused (${read?.error?.message || "no answer"}), so the page shows only its words.`, { key: read?.error?.reason || "none" }) };
    }
    if (read.blobData)
      return { src: `data:${block.mimeType};base64,${read.blobData}` };
    if (block.encoding === "base64" && str(read.text)) {
      let bytes = null;
      try {
        bytes = JSON.parse(read.text);
      } catch {}
      if (str(bytes) && /^[A-Za-z0-9+/=\s]+$/.test(bytes))
        return { src: `data:${block.mimeType};base64,${bytes.replace(/\s/g, "")}` };
    }
    if (str(read.text) && /^[A-Za-z0-9+/=\s]+$/.test(read.text.trim())) {
      return {
        src: `data:${block.mimeType};base64,${read.text.trim()}`,
        bend: bend("media-as-text", asked, `A picture (${block.mimeType}) reads as ${read.mimeType || "text"}, its bytes spelled as base64 text, not as the bytes themselves; the page decodes the text to show it.`, { key: read.mimeType })
      };
    }
    return { bend: bend("media-unreadable", asked, `A picture (${block.mimeType}) reads as ${read.mimeType || "nothing"}, which is neither its bytes nor base64, so the page shows only its words.`, { key: read.mimeType }) };
  }

  // blocks/render.js
  function renderBlocks(answer, ctx) {
    const out = [];
    const blocks = answer.blocks || [];
    for (let i = 0;i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === "link") {
        const run = [];
        while (i < blocks.length && blocks[i].type === "link")
          run.push(blocks[i++]);
        i--;
        out.push(wrap({ type: "link", from: run[0].from }, links(run, ctx), ctx));
        continue;
      }
      const draw = DRAW[b.type];
      out.push(wrap(b, draw && VOCABULARY[b.type] ? draw(b, ctx) : h("p.quiet", { text: `A block of type ${JSON.stringify(b.type)}, which this page does not know how to draw.` }), ctx));
    }
    return out;
  }
  function wrap(b, body, ctx) {
    return h("div.block", { "data-type": b.type }, body, b.from ? h("p.from", {}, h("span", { text: "from " }), ctx.link(b.from, short(b.from), "addr")) : null, b.from && ctx.mark ? ctx.mark(b) : null);
  }
  var kindWord = (t) => kindFromType(t) || (t ? t.split("/")[1] : null);
  var isNum = (v) => typeof v === "number";
  var cell = (v) => v === null || v === undefined ? "" : isNum(v) ? fmt(v) : String(v);
  var DRAW = {
    heading: (b) => h(`h${b.level}`, { text: b.text }),
    note: (b) => h("p.note", { text: b.text }),
    kv: (b) => h("dl.kv", {}, b.rows.map((r) => [h("dt", { text: r.key }), h(isNum(r.value) ? "dd.num" : "dd", { text: cell(r.value) })])),
    list: (b, ctx) => h("ul.items", {}, b.items.map((it) => h("li", {}, it.href ? ctx.link(it.href, it.text) : h("span", { text: it.text }), meta([it.rel, kindWord(it.type), isNum(it.count) ? `${fmt(it.count)}` : null, it.confidence && it.confidence !== "exact" ? it.confidence : null]), it.note ? h("p.item-note", { text: it.note }) : null))),
    table: (b, ctx) => h("div.table-wrap", {}, h("table", {}, b.title ? h("caption", { text: b.title }) : null, h("thead", {}, h("tr", {}, b.columns.map((c) => h("th", { scope: "col", text: c })))), h("tbody", {}, b.rows.map((row, r) => h("tr", {}, row.map((v, c) => {
      const td = isNum(v) ? "td.num" : "td";
      return h(td, {}, c === 0 && b.hrefs?.[r] ? ctx.link(b.hrefs[r], cell(v)) : cell(v));
    })))))),
    timeline: (b, ctx) => h("ol.timeline", {}, b.events.map((e) => h("li", {}, h("time", { text: String(e.at ?? "") }), e.href ? ctx.link(e.href, e.text) : h("span", { text: e.text })))),
    diff: (b) => h("div.table-wrap", {}, h("table.diff", {}, h("thead", {}, h("tr", {}, ["", "ours", "theirs", ""].map((c) => h("th", { scope: "col", text: c })))), h("tbody", {}, b.rows.map((r) => h(r.same ? "tr" : "tr.differs", {}, h("th", { scope: "row", text: r.path }), h(isNum(r.ours) ? "td.num" : "td", { text: cell(r.ours) }), h(isNum(r.theirs) ? "td.num" : "td", { text: cell(r.theirs) }), h("td.same", { text: r.same ? "same" : "differs" })))))),
    code: (b) => h("figure.code", {}, b.lang ? h("figcaption", { text: b.lang }) : null, h("pre", {}, h("code", { text: b.text }))),
    media: (b, ctx) => {
      const img = h("img", { alt: b.alt, hidden: true });
      const say = h("p.quiet.media-state", { text: "Reading the picture..." });
      ctx.picture(b, img, say);
      return h("figure.media", {}, img, say, h("figcaption", { text: b.alt }));
    },
    question: (b, ctx) => h("p.ask", {}, h("span", { text: b.text }), " ", ctx.link(b.href, "ask it")),
    finding: (b, ctx) => h("p.finding", {}, h("span", { text: b.text }), " ", ctx.link(b.href, "the finding")),
    trail: (b, ctx) => h("ol.trail", {}, b.steps.map((s) => h("li", {}, ctx.link(s.href, s.title || short(s.href)), s.title ? h("span.addr.quiet", { text: short(s.href) }) : null)))
  };
  function links(run, ctx) {
    return h("div.leads", {}, h("h2.leads-head", { text: "Where it leads" }), h("ul.items", {}, run.map((l) => h("li", {}, ctx.link(l.href, l.title || short(l.href)), meta([l.rel, kindWord(l.target_type), isNum(l.count) ? fmt(l.count) : null, l.confidence && l.confidence !== "exact" ? l.confidence : null])))));
  }
  function meta(bits) {
    const shown = bits.filter(Boolean);
    return shown.length ? h("span.meta", {}, shown.map((t) => h("span", { text: t }))) : null;
  }

  // panels/src/draw.js
  function drawBlocks(m, send) {
    const answer = Object.values(m.reads || {}).find((r) => r.mimeType === BLOCKS_TYPE && Array.isArray(r.body?.blocks))?.body;
    if (!answer)
      return [h("p.quiet", { text: "The host passed no blocks for this thing, so there is nothing to draw." })];
    const blocks = answer.blocks[0]?.type === "heading" && answer.blocks[0].level === 1 ? answer.blocks.slice(1) : answer.blocks;
    return renderBlocks({ ...answer, blocks }, {
      link: (uri, text, cls) => linkTo(h, send, uri, text, cls),
      picture: (block, img, say) => {
        const got = mediaOf(m.uri, block, m.reads?.[block.href] || null);
        if (got.src) {
          img.src = got.src;
          img.hidden = false;
          say.remove();
        } else
          say.textContent = "Not passed to this panel, so only its words are shown.";
      },
      mark: (b) => {
        const input = h("input", { name: "q", placeholder: "Ask about this piece", "aria-label": "A question about this piece" });
        const ask = () => {
          const q = String(input.value || "").trim();
          if (q)
            send.ask(b.from, q);
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter")
            ask();
        });
        const box = h("div.ask-piece", { hidden: true }, input, h("button", { type: "button", text: "Ask", onclick: ask }));
        return [h("button.mark", { type: "button", text: "mark", title: b.from, onclick: () => {
          send.select(b.from);
          box.hidden = false;
        } }), box];
      }
    });
  }

  // panels/src/blocks.js
  start(drawBlocks);
})();
