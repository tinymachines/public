/**
 * The picture, on a thread of its own: the signal path's boarded bundle
 * encodes each frame (the NES source, the phase chained frame to frame),
 * and the three-line comb decode runs one of two ways. On WebGPU, the
 * decode is three compute passes over storage buffers (the native
 * shell's picture.wgsl, passes 1 to 3: the comb's chroma demodulated at
 * each line's phase and block-averaged, the decimated lowpass, the luma
 * scale and Catmull-Rom back to the grid with the matrix and the clamp),
 * every constant from the decoder instance (`decoder_params`), drawn
 * into this thread's own OffscreenCanvas. Without WebGPU, or if the
 * WebGPU decode disagrees with the bundle's own decode on the first
 * frame by more than the stated tolerance, or if WebGPU cannot present,
 * the wasm decode paints into a fresh OffscreenCanvas instead and the
 * page says which path it is on. Either way the frame goes back as an
 * ImageBitmap the page's canvas shows; the page's canvas is never handed
 * over, so a path that failed can always be replaced.
 *
 *   main -> here   { id, path: 'hello' | 'reset' }
 *                  { id, path: 'frame', colour, emphasis, parity }
 *   here -> main   { id, ok: true, answer } | { id, ok: false, error }
 */

import init, { Pipeline } from "../ntsc/wasm/ntsc_wasm.js";

const ready = init();
const WIDTH = 2048;
const HEIGHT = 240;
const LINES = 262;
/** The WebGPU decode against the wasm decode, bytes of 255, on the first frame. */
const TOLERANCE = 2;

let pipe = null;
let canvas = null; // this thread's own OffscreenCanvas, WebGPU or 2d
let ctx2d = null;
let gpu = null; // { device, ... } once built
let path = "wasm";
let why = null;
let agreement = null; // max byte difference measured on the first frame
let checked = false;
let lit = 0; // the first frame's middle-row byte sum, whichever path painted it

const SHADER = `
struct Params {
  n: u32, nd: u32, d: u32, rows: u32,
  row0: u32, width: u32, taps: u32, uv_half: u32,
  black: f32, scale_y: f32, amp_k: f32, pad0: f32,
  r_from_v: f32, g_from_u: f32, g_from_v: f32, b_from_u: f32,
  comb: vec4<f32>,
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> samples: array<f32>;
@group(0) @binding(2) var<storage, read> lines: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> sincos: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> taps: array<f32>;
@group(0) @binding(5) var<storage, read_write> dec: array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> lp: array<vec2<f32>>;
@group(0) @binding(7) var<storage, read_write> grid: array<u32>;

fn comb_luma(line: u32, i: u32) -> f32 {
  let prev = samples[(line - 1u) * p.n + i];
  let cur = samples[line * p.n + i];
  let next = samples[(line + 1u) * p.n + i];
  return p.comb.x * prev + p.comb.y * cur + p.comb.z * next;
}

@compute @workgroup_size(64)
fn decimate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if idx >= p.rows * p.nd { return; }
  let row = idx / p.nd;
  let j = idx % p.nd;
  let line = lines[row].x;
  let p0 = lines[row].z;
  let a0 = j * p.d;
  let b0 = min(a0 + p.d, p.n);
  var u = 0.0;
  var v = 0.0;
  for (var i = a0; i < b0; i = i + 1u) {
    let cur = samples[line * p.n + i];
    let chroma = cur - comb_luma(line, i);
    let a = chroma * p.amp_k;
    let sc = sincos[(p0 + i) % 12u];
    u = u + a * sc.x;
    v = v + a * sc.y;
  }
  let cnt = f32(b0 - a0);
  dec[idx] = vec2<f32>(u / cnt, v / cnt);
}

@compute @workgroup_size(64)
fn uv_filter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if idx >= p.rows * p.nd { return; }
  let row = idx / p.nd;
  let j = i32(idx % p.nd);
  var acc = vec2<f32>(0.0, 0.0);
  for (var k = 0u; k < p.taps; k = k + 1u) {
    let src = clamp(j + i32(k) - i32(p.uv_half), 0, i32(p.nd) - 1);
    acc = acc + taps[k] * dec[row * p.nd + u32(src)];
  }
  lp[idx] = acc;
}

fn catmull(row: u32, x: f32) -> vec2<f32> {
  let jf = floor(x);
  let t = x - jf;
  let j = i32(jf);
  let last = i32(p.nd) - 1;
  let p0 = lp[row * p.nd + u32(clamp(j - 1, 0, last))];
  let p1 = lp[row * p.nd + u32(clamp(j, 0, last))];
  let p2 = lp[row * p.nd + u32(clamp(j + 1, 0, last))];
  let p3 = lp[row * p.nd + u32(clamp(j + 2, 0, last))];
  return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t);
}

// Signal RGB to bytes, the bundle's own rounding: no display gamma here
// (push_frame goes straight from YUV to bytes).
@compute @workgroup_size(64)
fn rgb(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if idx >= p.rows * p.width { return; }
  let row = idx / p.width;
  let x = idx % p.width;
  let line = lines[row].x;
  let start = lines[row].y;
  let s = start + x;
  let y = (comb_luma(line, s) - p.black) * p.scale_y;
  let uv = catmull(row, f32(s) / f32(p.d));
  let r = clamp(y + p.r_from_v * uv.y, 0.0, 1.0);
  let g = clamp(y + p.g_from_u * uv.x + p.g_from_v * uv.y, 0.0, 1.0);
  let b = clamp(y + p.b_from_u * uv.x, 0.0, 1.0);
  let rb = u32(r * 255.0 + 0.5);
  let gb = u32(g * 255.0 + 0.5);
  let bb = u32(b * 255.0 + 0.5);
  grid[idx] = rb | (gb << 8u) | (bb << 16u) | (255u << 24u);
}

struct VsOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var o: VsOut;
  let x = f32(i32(i & 1u) * 4 - 1);
  let y = f32(i32(i >> 1u) * 4 - 1);
  o.pos = vec4<f32>(x, -y, 0.0, 1.0);
  o.uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
  return o;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let x = min(u32(in.uv.x * f32(p.width)), p.width - 1u);
  let y = min(u32(in.uv.y * f32(p.rows)), p.rows - 1u);
  let v = grid[y * p.width + x];
  return vec4<f32>(f32(v & 255u), f32((v >> 8u) & 255u), f32((v >> 16u) & 255u), 255.0) / 255.0;
}
`;

async function buildGpu(probe) {
  if (!("gpu" in navigator)) return { why: "this browser has no WebGPU" };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { why: "no WebGPU adapter" };
  const device = await adapter.requestDevice();
  const prm = probe.decoder_params();
  const [w0, w1, w2, black, scaleY, ampK, rFromV, gFromU, gFromV, bFromU, demodOffset, dF, row0F] = prm;
  const taps = prm.slice(13);
  const d = Math.round(dF);
  const row0 = Math.round(row0F);
  const n = probe.line_len();
  if (!n) return { why: "no frame encoded yet" };
  const nd = Math.ceil(n / d);
  const rows = HEIGHT;
  const shader = device.createShaderModule({ code: SHADER });
  const buf = (size, usage) => device.createBuffer({ size, usage });
  const ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const params = buf(80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const samples = buf(LINES * n * 4, ST);
  const linesBuf = buf(rows * 16, ST);
  const sincos = buf(12 * 16, ST);
  const tapsBuf = buf(taps.length * 4, ST);
  const dec = buf(rows * nd * 8, GPUBufferUsage.STORAGE);
  const lp = buf(rows * nd * 8, GPUBufferUsage.STORAGE);
  const grid = buf(rows * WIDTH * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  // Params, laid out as the shader declares: eight u32, eight f32, one vec4.
  const pv = new ArrayBuffer(80);
  const dv = new DataView(pv);
  [n, nd, d, rows, row0, WIDTH, taps.length, taps.length >> 1].forEach((v, i) => dv.setUint32(i * 4, v, true));
  [black, scaleY, ampK, 0, rFromV, gFromU, gFromV, bFromU, w0, w1, w2, 0].forEach((v, i) => dv.setFloat32(32 + i * 4, v, true));
  device.queue.writeBuffer(params, 0, pv);
  const sc = new Float32Array(12 * 4);
  for (let q = 0; q < 12; q++) {
    const theta = (2 * Math.PI * q) / 12 + demodOffset;
    sc[q * 4] = Math.sin(theta);
    sc[q * 4 + 1] = Math.cos(theta);
  }
  device.queue.writeBuffer(sincos, 0, sc);
  device.queue.writeBuffer(tapsBuf, 0, new Float32Array(taps));
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ...[1, 2, 3, 4].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } })),
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: "storage" } },
    ],
  });
  const bind = device.createBindGroup({
    layout,
    entries: [params, samples, linesBuf, sincos, tapsBuf, dec, lp, grid].map((b, i) => ({ binding: i, resource: { buffer: b } })),
  });
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const passes = ["decimate", "uv_filter", "rgb"].map((entryPoint) => device.createComputePipeline({ layout: pl, compute: { module: shader, entryPoint } }));
  const counts = [rows * nd, rows * nd, rows * WIDTH];
  const gpuCanvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = gpuCanvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const blit = device.createRenderPipeline({ layout: pl, vertex: { module: shader, entryPoint: "vs" }, fragment: { module: shader, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
  const staging = buf(rows * WIDTH * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  return { device, params, samples, linesBuf, grid, staging, bind, passes, counts, context, blit, canvas: gpuCanvas, n, rows, row0 };
}

function uploadFrame(g, samplesF32, phases, start) {
  g.device.queue.writeBuffer(g.samples, 0, samplesF32);
  const lines = new Uint32Array(g.rows * 4);
  for (let r = 0; r < g.rows; r++) {
    lines[r * 4] = g.row0 + r;
    lines[r * 4 + 1] = start;
    lines[r * 4 + 2] = phases[g.row0 + r];
  }
  g.device.queue.writeBuffer(g.linesBuf, 0, lines);
}

function runPasses(g, present) {
  const enc = g.device.createCommandEncoder();
  g.passes.forEach((pass, i) => {
    const c = enc.beginComputePass();
    c.setPipeline(pass);
    c.setBindGroup(0, g.bind);
    c.dispatchWorkgroups(Math.ceil(g.counts[i] / 64));
    c.end();
  });
  if (present && g.context && g.blit) {
    const view = g.context.getCurrentTexture().createView();
    const r = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    r.setPipeline(g.blit);
    r.setBindGroup(0, g.bind);
    r.draw(3);
    r.end();
  }
  g.device.queue.submit([enc.finish()]);
}

async function readGrid(g) {
  const enc = g.device.createCommandEncoder();
  enc.copyBufferToBuffer(g.grid, 0, g.staging, 0, g.rows * WIDTH * 4);
  g.device.queue.submit([enc.finish()]);
  await g.staging.mapAsync(GPUMapMode.READ);
  const out = new Uint8Array(g.staging.getMappedRange().slice(0));
  g.staging.unmap();
  return out;
}

/** The first frame both ways: the WebGPU decode against the wasm decode. */
async function check(colour, emphasis, parity) {
  const cpu = new Pipeline("comb3");
  const gpuPipe = new Pipeline("comb3");
  const want = cpu.push_frame(colour, emphasis, parity);
  const s = gpuPipe.encode(colour, emphasis, parity);
  uploadFrame(gpu, s, gpuPipe.line_phases(), gpuPipe.active_start());
  runPasses(gpu, false);
  const got = await readGrid(gpu);
  let worst = 0;
  for (let i = 0; i < want.length; i += 4) {
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(want[i + c] - got[i + c]));
  }
  return { worst, lit: litOf(got) };
}

/** How lit a frame is: the byte sum of one row, for the page's check. Row
 *  45 rather than the middle: the repository's test cartridge paints a
 *  band at rows 32..63 of the picture and black elsewhere. */
const LIT_ROW = 45;
function litOf(rgba) {
  let sum = 0;
  const row = LIT_ROW * WIDTH * 4;
  for (let i = row; i < row + WIDTH * 4; i += 4) sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
  return sum;
}

function paintWasm(rgba) {
  if (!ctx2d) {
    canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    ctx2d = canvas.getContext("2d");
  }
  ctx2d.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), WIDTH, HEIGHT), 0, 0);
  return canvas.transferToImageBitmap();
}

// One message at a time: the first frame's WebGPU attempt awaits, and a
// frame handled meanwhile would take the other path on the same canvas.
let chain = Promise.resolve();
self.onmessage = (e) => {
  chain = chain.then(() => handle(e)).catch(() => {});
};

async function handle(e) {
  const { id, path: p } = e.data;
  try {
    await ready;
    if (!pipe) pipe = new Pipeline("comb3");
    if (p === "hello") {
      self.postMessage({ id, ok: true, answer: { width: WIDTH, height: HEIGHT } });
      return;
    }
    if (p === "reset") {
      pipe = new Pipeline("comb3");
      self.postMessage({ id, ok: true, answer: { width: WIDTH, height: HEIGHT } });
      return;
    }
    if (p === "frame") {
      const { colour, emphasis, parity } = e.data;
      const t0 = performance.now();
      if (!checked) {
        // First frame: try to build the WebGPU decode and hold it to the
        // wasm decode; on any refusal the wasm path stands and says why.
        checked = true;
        // The whole attempt races a clock: a WebGPU that never answers
        // (seen under a software adapter) must not hold the picture.
        let stage = "adapter";
        const attempt = (async () => {
          const probe = new Pipeline("comb3");
          probe.encode(colour, emphasis, parity);
          const g = await buildGpu(probe);
          if (g.why) {
            why = g.why;
            return;
          }
          gpu = g;
          stage = "first frame";
          const c = await check(colour, emphasis, parity);
          agreement = c.worst;
          lit = c.lit;
          if (agreement > TOLERANCE) {
            why = `the WebGPU decode differs from the wasm decode by ${agreement} of 255 on the first frame (tolerance ${TOLERANCE})`;
            gpu = null;
            return;
          }
          // And it must present: a canvas WebGPU cannot draw to is no use.
          stage = "canvas";
          runPasses(gpu, true);
          const bmp = gpu.canvas.transferToImageBitmap();
          bmp.close();
          path = "webgpu";
        })();
        const clock = new Promise((r) => setTimeout(() => r("timeout"), 5000));
        try {
          const won = await Promise.race([attempt, clock]);
          if (won === "timeout") {
            why = `WebGPU did not answer within five seconds at the ${stage}`;
            gpu = null;
          }
        } catch (err) {
          why = `WebGPU refused at the ${stage}: ${String(err?.message ?? err)}`;
          gpu = null;
        }
      }
      let encodeMs = 0;
      let decodeMs = 0;
      let bitmap;
      if (path === "webgpu" && gpu) {
        try {
          const s = pipe.encode(colour, emphasis, parity);
          const t1 = performance.now();
          uploadFrame(gpu, s, pipe.line_phases(), pipe.active_start());
          runPasses(gpu, true);
          bitmap = gpu.canvas.transferToImageBitmap();
          encodeMs = t1 - t0;
          decodeMs = performance.now() - t1;
        } catch (err) {
          // WebGPU failed mid-run (a lost device, a canvas it can no
          // longer present to): the wasm path takes over for good.
          why = `WebGPU failed while running: ${String(err?.message ?? err)}`;
          path = "wasm";
          gpu = null;
        }
      }
      if (path !== "webgpu") {
        const rgba = pipe.push_frame(colour, emphasis, parity);
        decodeMs = performance.now() - t0;
        if (!lit) lit = litOf(rgba);
        bitmap = paintWasm(rgba);
      }
      self.postMessage({ id, ok: true, answer: { bitmap, path, why, agreement, tolerance: TOLERANCE, lit, encodeMs, decodeMs, width: WIDTH, height: HEIGHT } }, [bitmap]);
      return;
    }
    throw new Error(`unknown path ${JSON.stringify(p)}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
}
