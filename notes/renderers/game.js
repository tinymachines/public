// tinylens panel: game. Built by scripts/build-panels.mjs from panels/src; do not edit.
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
  var readOf = (m) => ({ uri: m.uri, mimeType: m.mimeType, body: m.body, links: m.links || [], error: null });

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
  var fmt = (n) => typeof n === "number" ? n.toLocaleString("en-US") : String(n ?? "");

  // src/core.js
  function splitUri(uri) {
    let rest = uri;
    let fragment = null;
    const hash = rest.indexOf("#");
    if (hash >= 0) {
      fragment = rest.slice(hash + 1);
      rest = rest.slice(0, hash);
    }
    let query = "";
    const q = rest.indexOf("?");
    if (q >= 0) {
      query = rest.slice(q + 1);
      rest = rest.slice(0, q);
    }
    const params = query ? query.split("&").filter(Boolean).map((kv) => {
      const i = kv.indexOf("=");
      return i < 0 ? [decodeURIComponent(kv), ""] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))];
    }) : [];
    const m = /^tm:\/\/([^/]*)\/?(.*)$/.exec(rest);
    const host = m ? m[1] : "";
    const path = m ? m[2] : "";
    const segs = path.split("/").filter(Boolean);
    return {
      base: rest,
      params,
      fragment,
      host,
      mount: segs[0] || "",
      instance: segs[0] === "git" || segs[0] === "http" ? segs[1] || "" : "",
      path,
      collection: rest.endsWith("/")
    };
  }
  var IANA = new Set(["up", "collection", "alternate", "describedby", "version-history", "latest-version", "next"]);

  // src/compose.js
  var NES_FPS = 60.0988;
  var fmt2 = (n) => typeof n === "number" ? n.toLocaleString("en-US") : String(n);
  var linksOf = (read, rel) => (read.links || []).filter((l) => l.rel === rel);
  var keyOf = (uri) => splitUri(uri).path.split("/").filter(Boolean).pop();
  function composeGame(read) {
    const b = read.body;
    const patternHref = new Map(linksOf(read, "tm:exhibits").map((l) => [keyOf(l.href), l.href]));
    const patterns = Object.entries(b.patterns || {}).map(([key, count]) => ({ key, count, uri: patternHref.get(key) || null })).sort((a, c) => c.count - a.count || a.key.localeCompare(c.key));
    const minutes = typeof b.frames === "number" ? b.frames / NES_FPS / 60 : null;
    const pages = linksOf(read, "tm:renders-as");
    const page = pages.find((l) => !/\/beta\.|\/ja\//.test(l.href)) || pages[0] || null;
    const lede = [];
    if (minutes !== null)
      lede.push(`Played on our console for ${fmt2(b.frames)} frames, about ${fmt2(Math.round(minutes))} minutes at the NES's ${NES_FPS} frames a second, running ${fmt2(b.instructions)} instructions.`);
    if (patterns.length)
      lede.push(`It shows ${patterns.length} of the patterns, ${fmt2(patterns.reduce((s, p) => s + p.count, 0))} times in all; ${patterns[0].key} most of all (${fmt2(patterns[0].count)}).`);
    const lessons = linksOf(read, "tm:measured-by").map((l) => ({ uri: l.href, title: l.title || keyOf(l.href) }));
    if (lessons.length)
      lede.push(`${lessons.length} of our lessons were measured beside it.`);
    return {
      kind: "game",
      minutes,
      title: b.name,
      kicker: `A game the autopsy played${typeof b.mapper === "number" ? `, mapper ${b.mapper}` : ""}`,
      lede,
      patterns,
      lessons,
      page: page ? page.href : null,
      data: linksOf(read, "tm:data")[0]?.href || null
    };
  }

  // blocks/vocab.js
  var RESERVED = new Set(["question", "finding"]);

  // panels/src/draw.js
  var lede = (lines) => h("div.lede", {}, lines.map((t) => h("p", { text: t })));
  var items = (send, list) => h("ul.items", {}, list.map((it) => h("li", {}, linkTo(h, send, it.uri, it.text), it.meta ? h("span.meta", {}, h("span", { text: it.meta })) : null)));
  function drawGame(m, send) {
    const model = composeGame(readOf(m));
    const max = Math.max(1, ...model.patterns.map((p) => p.count));
    const out = [lede(model.lede)];
    if (model.patterns.length) {
      out.push(h("h2", { text: "The patterns it shows, most first" }), h("ul.bars", {}, model.patterns.map((p) => h("li", {}, p.uri ? linkTo(h, send, p.uri, p.key) : h("span", { text: p.key }), h("span.bar", {}, h("span", { style: `width:${(p.count / max * 100).toFixed(1)}%` })), h("span.n", { text: fmt(p.count) })))));
    }
    if (model.lessons.length)
      out.push(h("h2", { text: "Our lessons measured beside it" }), items(send, model.lessons.map((l) => ({ uri: l.uri, text: l.title }))));
    const more = [model.page ? { uri: model.page, text: "Its page" } : null, model.data ? { uri: model.data, text: "Its record" } : null].filter(Boolean);
    if (more.length)
      out.push(h("p.actions", {}, more.map((x) => linkTo(h, send, x.uri, x.text))));
    return out;
  }

  // panels/src/game.js
  start(drawGame);
})();
