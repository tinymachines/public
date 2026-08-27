import { points, type Poly } from "@/lib/shell/geom";

/**
 * The parts kit: every control of the console shell as an SVG group drawn
 * from the box the solver docked it in, in units, local origin at the box's
 * centre (pack, 03-COMPONENTS.md). Nothing here knows about the chip; the
 * parts draw, and Shell.tsx lays real buttons over the ones that act, so a
 * finger and a screen reader meet a <button> and the eye meets a polygon.
 *
 * Shapes: closed polygons with edges at 0, 45 or 90 degrees, vertices on the
 * half-module (4u) grid inside a part and the module (8u) grid at its box
 * (ISSUES #3 says why the half module). Circles only where the pack lists
 * them: the coin, the LEDs, the d-pad pivot. No gradients, no filters: the
 * bevel is two flat tones.
 *
 * States are attributes on the group (`data-state`, `data-led`), never
 * redrawn geometry; shell.css keys on them. Fills are tokens by role:
 *   --shell-face / --shell-lit / --shell-shade   the plastic
 *   --shell-a / --shell-b / --shell-coin          the accents
 * Legends are not drawn here: the words on a control are the text of the
 * HTML button laid over it, in the house mono at a size the frame does not
 * scale (SVG text would be 48px on a desktop and overflow a phone's pill).
 */

export const A = (p: Poly) => points(p);

/** A chamfered rectangle: corners cut back by c along both edges. */
export function chamfered(x: number, y: number, w: number, h: number, c: number): Poly {
  // A chamfer is never more than a quarter of the short side, on the half
  // module; a shape too small for one is a rectangle, which lint accepts.
  c = Math.min(c, Math.floor(Math.min(w, h) / 4 / 4) * 4);
  if (c <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return [
    [x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c],
    [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c],
  ];
}

const Part = ({ w, h, id, children, className, ...rest }: { w: number; h: number; id: string; children: React.ReactNode; className?: string } & Record<string, unknown>) => (
  <svg className={"part " + (className ?? "")} viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden="true" data-part={id} {...rest}>
    {children}
  </svg>
);

/**
 * ctl-dpad. A cross with arms half the box wide, a 45-degree arrow cut into
 * each arm as the dark face, and the pivot ghost. The four arm groups carry
 * `data-arm` so a press can shade one.
 */
export function Dpad({ w, h }: { w: number; h: number }) {
  const D = Math.min(w, h);
  if (D < 16) {
    // Below 16u there is no cross to draw; the solver never docks one, the lint still asks.
    return <Part w={w} h={h} id="ctl-dpad"><polygon className="face" points={A(chamfered(0, 0, w, h, 0))} /></Part>;
  }
  const t = Math.round(D / 4 / 4) * 4 * 2; // arm width: half the box, on the half module
  const ox = (w - D) / 2, oy = (h - D) / 2;
  const a = ox + (D - t) / 2, b = a + t; // arm inner edges
  const cross: Poly = [
    [a, oy], [b, oy], [b, oy + a - ox], [ox + D, oy + a - ox], [ox + D, oy + b - ox], [b, oy + b - ox],
    [b, oy + D], [a, oy + D], [a, oy + b - ox], [ox, oy + b - ox], [ox, oy + a - ox], [a, oy + a - ox],
  ];
  const cx = ox + D / 2, cy = oy + D / 2;
  const s = Math.max(4, t / 4); // arrow half-width
  const arrows: [string, Poly][] = [
    ["up", [[cx - s, oy + 2 * s], [cx + s, oy + 2 * s], [cx, oy + s]]],
    ["down", [[cx - s, oy + D - 2 * s], [cx + s, oy + D - 2 * s], [cx, oy + D - s]]],
    ["left", [[ox + 2 * s, cy - s], [ox + 2 * s, cy + s], [ox + s, cy]]],
    ["right", [[ox + D - 2 * s, cy - s], [ox + D - 2 * s, cy + s], [ox + D - s, cy]]],
  ];
  return (
    <Part w={w} h={h} id="ctl-dpad">
      <polygon className="face" points={A(cross)} />
      {/* the four 45-degree pivot facets: the inner corners, shaded */}
      <polygon className="shade" points={A([[a, oy + a - ox], [a, oy + a - ox - s], [a - s, oy + a - ox]])} />
      <polygon className="shade" points={A([[b, oy + a - ox], [b + s, oy + a - ox], [b, oy + a - ox - s]])} />
      <polygon className="shade" points={A([[b, oy + b - ox], [b, oy + b - ox + s], [b + s, oy + b - ox]])} />
      <polygon className="shade" points={A([[a, oy + b - ox], [a - s, oy + b - ox], [a, oy + b - ox + s]])} />
      {arrows.map(([d, p]) => (
        <polygon key={d} className="arrow" data-arm={d} points={A(p)} />
      ))}
      <circle className="pivot" cx={cx} cy={cy} r={s / 2} />
    </Part>
  );
}

/**
 * ctl-ab. Two octagons, B low on the left and A high on the right (the NES
 * stagger), each read as concave through an inset inner octagon in the dark
 * tone. Disabled here, and drawn so: this console's controller byte carries
 * four directions (ISSUES #2).
 */
export function AB({ w, h }: { w: number; h: number }) {
  // Each key is half the box: B low left, A high right, meeting at the
  // centre, so a square box holds a pair the size of a thumb.
  const b = Math.max(4, Math.floor(Math.min(w, h) / 2 / 4) * 4);
  // Below 16u an octagon has no room for a chamfer on the half module: a square, honestly.
  const c = b >= 16 ? Math.floor(b / 4 / 4) * 4 : 0;
  const inset = 4;
  const bx = 0, by = h - b, ax = w - b, ay = 0;
  return (
    <Part w={w} h={h} id="ctl-ab">
      <g data-key="b">
        <polygon className="key key-b" points={A(chamfered(bx, by, b, b, c))} />
        {b >= 16 ? <polygon className="well" points={A(chamfered(bx + inset, by + inset, b - 2 * inset, b - 2 * inset, Math.max(0, c - inset)))} /> : null}
      </g>
      <g data-key="a">
        <polygon className="key key-a" points={A(chamfered(ax, ay, b, b, c))} />
        {b >= 16 ? <polygon className="well" points={A(chamfered(ax + inset, ay + inset, b - 2 * inset, b - 2 * inset, Math.max(0, c - inset)))} /> : null}
      </g>
    </Part>
  );
}

/** ctl-pills. select and start, chamfered, in a recessed tray. Row or stack. */
export function Pills({ w, h, stack }: { w: number; h: number; stack?: boolean }) {
  const pw = stack ? w : Math.floor((w - 8) / 2 / 4) * 4;
  const ph = stack ? Math.max(4, Math.floor((h - 8) / 2 / 4) * 4) : h;
  const p0 = { x: 0, y: 0 }, p1 = stack ? { x: 0, y: h - ph } : { x: w - pw, y: 0 };
  const c = 4;
  return (
    <Part w={w} h={h} id="ctl-pills">
      {[p0, p1].map((p, i) => (
        <g key={i} data-pill={i === 0 ? "select" : "start"}>
          <polygon className="tray" points={A(chamfered(p.x, p.y, pw, ph, c))} />
          {ph >= 16 && pw >= 16
            ? <polygon className="pill" points={A(chamfered(p.x + 4, p.y + 4, pw - 8, ph - 8, 0))} />
            : <polygon className="pill" points={A(chamfered(p.x, p.y, pw, ph, c))} />}
        </g>
      ))}
    </Part>
  );
}

/**
 * sys-power. A reset push button (the console's, owner's call 2026-08-28:
 * a push button like the console's own, not a rocker with a hold), a
 * fast/slow slide switch, and the LED, whose state is the shell's
 * `data-led`: off, boot (amber, ATTENTION), live (blue, ACTIVE). Never red:
 * red is an assertion failing, on every page of this site (ISSUES #5).
 *
 * The switch draws both knob positions; shell.css shows the one
 * `data-pace` on the shell names, so the state is an attribute, not
 * geometry, as the kit's rule has it.
 */
/** The switch's knob for a tray of w by h: inset a half module where there is room, half the tray wide, never nothing. */
function knob(w: number, h: number): { in: number; w: number; h: number } {
  const inset = h >= 16 && w >= 16 ? 4 : 0;
  return { in: inset, w: Math.max(4, Math.floor((w - 2 * inset) / 2 / 4) * 4), h: Math.max(4, h - 2 * inset) };
}

export function Power({ w, h, stack }: { w: number; h: number; stack?: boolean }) {
  const c = 4;
  // The row form needs 56u; narrower than that it stacks, whatever was asked.
  if (stack || w < 56) {
    const rh = Math.max(4, Math.floor((h - 8 - 8) / 2 / 4) * 4);
    const ty = rh + 8, th = Math.max(8, Math.min(16, h - ty - 12));
    const k = knob(w, th);
    return (
      <Part w={w} h={h} id="sys-power">
        <g data-key="reset">
          <polygon className="chiclet" points={A(chamfered(0, 0, w, rh, c))} />
        </g>
        <g data-key="pace">
          <polygon className="tray" points={A(chamfered(0, ty, w, th, c))} />
          <polygon className="knob" data-pos="slow" points={A(chamfered(k.in, ty + k.in, k.w, k.h, 0))} />
          <polygon className="knob" data-pos="fast" points={A(chamfered(w - k.in - k.w, ty + k.in, k.w, k.h, 0))} />
        </g>
        <circle className="led" cx={w / 2} cy={h - 4} r={3} />
      </Part>
    );
  }
  const rw = Math.floor((w - 8 - 8 - 8) * 0.55 / 8) * 8; // the button, on the module
  const sw = w - rw - 8 - 8 - 8;                          // the switch takes the rest
  const sx = rw + 8, th = Math.min(16, h), ty = Math.floor((h - th) / 2 / 4) * 4;
  const k = knob(sw, th);
  return (
    <Part w={w} h={h} id="sys-power">
      <g data-key="reset">
        <polygon className="chiclet" points={A(chamfered(0, 0, rw, h, c))} />
      </g>
      <g data-key="pace">
        <polygon className="tray" points={A(chamfered(sx, ty, sw, th, c))} />
        <polygon className="knob" data-pos="slow" points={A(chamfered(sx + k.in, ty + k.in, k.w, k.h, 0))} />
        <polygon className="knob" data-pos="fast" points={A(chamfered(sx + sw - k.in - k.w, ty + k.in, k.w, k.h, 0))} />
      </g>
      <circle className="led" cx={w - 4} cy={h / 2} r={3} />
    </Part>
  );
}

/**
 * A digit as seven segment polygons, never a glyph (pack, tokens.seed.json).
 * Cell is 12 wide, 20 tall, segments 4 thick, on the half module.
 */
const SEG: Record<string, number[]> = {
  "0": [1, 1, 1, 1, 1, 1, 0], "1": [0, 1, 1, 0, 0, 0, 0], "2": [1, 1, 0, 1, 1, 0, 1], "3": [1, 1, 1, 1, 0, 0, 1],
  "4": [0, 1, 1, 0, 0, 1, 1], "5": [1, 0, 1, 1, 0, 1, 1], "6": [1, 0, 1, 1, 1, 1, 1], "7": [1, 1, 1, 0, 0, 0, 0],
  "8": [1, 1, 1, 1, 1, 1, 1], "9": [1, 1, 1, 1, 0, 1, 1], "-": [0, 0, 0, 0, 0, 0, 1],
};
export function Digit({ x, y, ch, s = 1 }: { x: number; y: number; ch: string; s?: number }) {
  const on = SEG[ch] ?? SEG["-"];
  const t = 4 * s, W = 12 * s, H = 20 * s;
  const segs: Poly[] = [
    [[x, y], [x + W, y], [x + W, y + t], [x, y + t]],                                   // a top
    [[x + W - t, y], [x + W, y], [x + W, y + H / 2], [x + W - t, y + H / 2]],           // b top right
    [[x + W - t, y + H / 2], [x + W, y + H / 2], [x + W, y + H], [x + W - t, y + H]],   // c bottom right
    [[x, y + H - t], [x + W, y + H - t], [x + W, y + H], [x, y + H]],                   // d bottom
    [[x, y + H / 2], [x + t, y + H / 2], [x + t, y + H], [x, y + H]],                   // e bottom left
    [[x, y], [x + t, y], [x + t, y + H / 2], [x, y + H / 2]],                           // f top left
    [[x, y + H / 2 - t / 2], [x + W, y + H / 2 - t / 2], [x + W, y + H / 2 + t / 2], [x, y + H / 2 + t / 2]], // g middle
  ];
  return (
    <g className="digit">
      {segs.map((p, i) => <polygon key={i} className={on[i] ? "seg on" : "seg"} points={A(p)} />)}
    </g>
  );
}

/** A two-digit counter box, digits scaled to the box. */
export function Counter({ w, h, value }: { w: number; h: number; value: number }) {
  const s = Math.min(h / 24, w / 32);
  const text = String(Math.max(0, Math.min(99, value))).padStart(2, "0");
  const x0 = (w - 28 * s) / 2, y0 = (h - 20 * s) / 2;
  return (
    <Part w={w} h={h} id="hud-counter">
      <rect className="well" x={0} y={0} width={w} height={h} />
      <Digit x={x0} y={y0} ch={text[0]} s={s} />
      <Digit x={x0 + 16 * s} y={y0} ch={text[1]} s={s} />
    </Part>
  );
}

/**
 * sys-coin. The acceptor plate with its vertical slot and the coin, and the
 * credits counter under it. `data-state="drop"` runs the coin down the slot.
 */
export function Coin({ w, h, credits }: { w: number; h: number; credits: number }) {
  const ph = Math.max(4, Math.floor((h - 8) * 0.6 / 4) * 4); // plate height
  const pw = Math.min(w, 40);
  const px = (w - pw) / 2;
  const sw = 4, sh = Math.max(4, ph - 12);
  const sx = px + pw / 2 - sw / 2, sy = 6;
  const ch = Math.max(4, h - ph - 8);
  return (
    <Part w={w} h={h} id="sys-coin">
      <polygon className="plate" points={A(chamfered(px, 0, pw, ph, 4))} />
      <rect className="slot" x={sx} y={sy} width={sw} height={sh} />
      <circle className="coin" cx={px + pw / 2} cy={sy + 4} r={5} />
      <g transform={`translate(0 ${ph + 8})`}>
        <rect className="well" x={px} y={0} width={pw} height={ch} />
        {(() => {
          const s = Math.min(ch / 24, pw / 32);
          const text = String(Math.max(0, Math.min(99, credits))).padStart(2, "0");
          const x0 = px + (pw - 28 * s) / 2, y0 = (ch - 20 * s) / 2;
          return (<>
            <Digit x={x0} y={y0} ch={text[0]} s={s} />
            <Digit x={x0 + 16 * s} y={y0} ch={text[1]} s={s} />
          </>);
        })()}
      </g>
    </Part>
  );
}

/** sys-speaker. Parallel 45-degree slots in a chamfered field. Decoration, dropped first. */
export function Speaker({ w, h }: { w: number; h: number }) {
  const slots: Poly[] = [];
  for (let x = 4; h >= 16 && x + h - 4 + 4 <= w - 4; x += 8) { // a grille needs 16u of height for a 45-degree slot
    slots.push([[x, h - 4], [x + h - 8, 4], [x + h - 4, 4], [x + 4, h - 4]]);
  }
  return (
    <Part w={w} h={h} id="sys-speaker">
      <polygon className="face" points={A(chamfered(0, 0, w, h, 4))} />
      {slots.map((p, i) => <polygon key={i} className="slot" points={A(p)} />)}
    </Part>
  );
}

/** One cartridge: the shell, the label window, the detect notch, an LED when loaded. Proportional to its box. */
export function Cart({ w, h, accent, loaded }: { w: number; h: number; accent: string; loaded?: boolean }) {
  const c = Math.max(2, Math.round(Math.min(w, h) / 12 / 2) * 2);
  const lx = Math.round(w / 12), ly = Math.round(h / 8), lw = w - 2 * lx, lh = Math.max(4, Math.round(h / 2));
  const body = h - Math.max(2, Math.round(h / 10));
  return (
    <Part w={w} h={h} id="sys-cart" data-loaded={loaded ? "1" : undefined} style={{ ["--cart" as string]: accent }}>
      <polygon className="cart-shell" points={A(chamfered(0, 0, w, body, c))} />
      <rect className="cart-label" x={lx} y={ly} width={lw} height={lh} />
      <rect className="cart-notch" x={w / 2 - w / 6} y={h - 2 * (h - body)} width={w / 3} height={h - body} />
      {loaded ? <circle className="led" cx={w - lx - 1} cy={body - (body - ly - lh) / 2} r={Math.max(1, Math.min(w, h) / 20)} /> : null}
    </Part>
  );
}

/** nav-swiperail: one dot per page, the active one filled, chevrons either end. */
export function Rail({ w, h, pages, active }: { w: number; h: number; pages: number; active: number }) {
  const r = Math.min(h / 4, 2);
  const step = Math.min(12, (w - 16) / Math.max(1, pages - 1));
  const x0 = (w - step * (pages - 1)) / 2;
  const cy = h / 2;
  return (
    <Part w={w} h={h} id="nav-swiperail">
      <polyline className="chev" points={`${x0 - 10},${cy - 3} ${x0 - 13},${cy} ${x0 - 10},${cy + 3}`} fill="none" />
      {Array.from({ length: pages }, (_, i) => (
        <circle key={i} className={i === active ? "dot on" : "dot"} cx={x0 + i * step} cy={cy} r={r} />
      ))}
      <polyline className="chev" points={`${w - x0 + 10},${cy - 3} ${w - x0 + 13},${cy} ${w - x0 + 10},${cy + 3}`} fill="none" />
    </Part>
  );
}

/** nav-quick: four octagon chips, in a row or two by two. */
export function Quick({ w, h, stack, n = 4 }: { w: number; h: number; stack?: boolean; n?: number }) {
  const b = Math.max(4, stack ? Math.floor((Math.min(w, h) - 8) / 2 / 4) * 4 : Math.min(h, Math.floor((w - 8 * (n - 1)) / n / 4) * 4));
  const c = Math.max(4, Math.round(b / 4 / 4) * 4);
  return (
    <Part w={w} h={h} id="nav-quick">
      {Array.from({ length: n }, (_, i) => {
        const x = stack ? (i % 2) * (b + 8) : i * (b + 8);
        const y = stack ? Math.floor(i / 2) * (b + 8) : Math.floor((h - b) / 2 / 4) * 4;
        return (
          <g key={i} data-chip={i}>
            <polygon className="chip" points={A(chamfered(x, y, b, b, c))} />
          </g>
        );
      })}
    </Part>
  );
}
