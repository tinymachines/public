/**
 * The 64 colours, measured. There is no RGB table anywhere on this site by
 * design: a colour code is what the console puts on the wire, and what it
 * looks like is what the signal path makes of it. So the playground's
 * colour station and the play page's sprite sheet paint from the same
 * measurement, taken here once per worker: every code laid out as blocks
 * on one frame, encoded and comb-decoded through the boarded pipeline, the
 * middle of each block averaged. One copy, imported by both workers.
 *
 * `learnShape` needs a real frame's planes because the dots a line come
 * from the plane's length over the lines the encoder makes of it; the
 * rest is asked of the pipeline.
 */

/**
 * The frame's shape, asked of the bundles: the line's samples and where
 * the picture starts come from an encode of a real frame, the picture's
 * size from the decoder, and the dots a line from the plane's length
 * over the lines the encoder made of it.
 */
export function learnShape(Pipeline, frame) {
  const p = new Pipeline("comb3");
  const volts = p.encode(frame.colour, frame.emphasis, frame.parity);
  const lineLen = p.line_len();
  const lines = volts.length / lineLen;
  const dots = frame.colour.length / lines;
  const perDot = lineLen / dots;
  const g = {
    lineLen,
    lines,
    dots,
    perDot,
    pictureX: p.active_start() / perDot,
    pictureW: p.width() / perDot,
    pictureH: p.height(),
    outW: p.width(),
  };
  p.free();
  return g;
}

export function measurePalette(Pipeline, g) {
  const rows = 4;
  const cellW = g.pictureW / 16;
  const cellH = Math.floor(g.pictureH / rows);
  const colour = new Uint8Array(g.dots * g.lines);
  const emphasis = new Uint8Array(g.dots * g.lines);
  for (let y = 0; y < g.lines; y++) {
    const r = Math.min(rows - 1, Math.floor(y / cellH));
    for (let x = 0; x < g.dots; x++) {
      const px = Math.min(g.pictureW - 1, Math.max(0, x - g.pictureX));
      colour[y * g.dots + x] = (r << 4) | Math.floor(px / cellW);
    }
  }
  const pipe = new Pipeline("comb3");
  // Twice: the comb and the phase chain settle on the second frame.
  pipe.push_frame(colour, emphasis, 0);
  const rgba = pipe.push_frame(colour, emphasis, 0);
  const sx = g.outW / g.pictureW; // output pixels a dot
  const rgb = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 16; c++) {
      // The middle half of each block, away from the comb's edges.
      let R = 0, G = 0, B = 0, n = 0;
      const y0 = r * cellH + Math.floor(cellH / 4);
      const y1 = r * cellH + Math.floor((cellH * 3) / 4);
      const x0 = Math.floor((c * cellW + cellW / 4) * sx);
      const x1 = Math.floor((c * cellW + (cellW * 3) / 4) * sx);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * g.outW + x) * 4;
          R += rgba[i]; G += rgba[i + 1]; B += rgba[i + 2]; n++;
        }
      }
      rgb.push([Math.round(R / n), Math.round(G / n), Math.round(B / n)]);
    }
  }
  pipe.free();
  // One encoded line through the middle of each row of blocks: the waves.
  const enc = new Pipeline("comb3");
  const volts = enc.encode(colour, emphasis, 0);
  const waves = [];
  for (let r = 0; r < rows; r++) {
    const line = r * cellH + Math.floor(cellH / 2);
    waves.push(Array.from(volts.subarray(line * g.lineLen, (line + 1) * g.lineLen)));
  }
  enc.free();
  return { rgb, waves, cellW };
}

