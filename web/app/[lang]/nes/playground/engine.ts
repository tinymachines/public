/**
 * The playground's line to its worker (public/nes/playground.worker.mjs):
 * one module worker, requests answered by id. Nothing here knows the
 * frame's shape; every answer carries the shape the worker learned from
 * the bundles, and the stations draw from that.
 */

export interface Shape {
  lineLen: number;
  lines: number;
  dots: number;
  perDot: number;
  pictureX: number;
  pictureW: number;
  pictureH: number;
  outW: number;
}
export interface Frame {
  serial: number;
  colour: Uint8Array;
  rgba: Uint8Array | null;
  parity: number;
  halfCycles: number;
  shape: Shape;
}
export interface Palette {
  rgb: [number, number, number][];
  waves: number[][];
  cellW: number;
}
export interface Wire {
  volts: Float32Array;
  colour: Uint8Array;
  shape: Shape;
}

type Outcome<A> = { id: number; ok: true; answer: A } | { id: number; ok: false; error: string };

export class Engine {
  private worker: Worker;
  private next = 1;
  private waiting = new Map<number, { resolve: (a: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker("/nes/playground.worker.mjs", { type: "module" });
    this.worker.onmessage = (e: MessageEvent<Outcome<unknown>>) => {
      const w = this.waiting.get(e.data.id);
      if (!w) return;
      this.waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.answer);
      else w.reject(new Error(e.data.error));
    };
  }

  private ask<A>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<A> {
    const id = this.next++;
    return new Promise<A>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (a: unknown) => void, reject });
      this.worker.postMessage({ id, ...msg }, transfer);
    });
  }

  load(url: string) {
    return this.ask<{ bytes: number }>({ path: "load", url });
  }
  loadBytes(rom: ArrayBuffer) {
    return this.ask<{ bytes: number }>({ path: "load", rom }, [rom]);
  }
  run(n: number, pad: number, decode: boolean) {
    return this.ask<Frame>({ path: "run", n, pad, decode });
  }
  wire(serial: number) {
    return this.ask<Wire>({ path: "wire", serial });
  }
  palette() {
    return this.ask<Palette>({ path: "palette" });
  }
  dispose() {
    this.worker.terminate();
  }
}
