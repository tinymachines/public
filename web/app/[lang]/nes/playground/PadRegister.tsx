"use client";

import { useEffect, useState } from "react";
import { BIT, BUTTONS } from "./Playground";
import { ui } from "./ui";
import type { Lang } from "@/lib/lang";

/**
 * The pad's shift register, acted out. On "read", the latch takes a
 * snapshot of the buttons; then each clock tick moves the next bit onto
 * the wire, in the order the register holds them, and the console
 * gathers them into a byte. The wire carries a pressed button as a low
 * level, which is why the console's byte is the wire's, flipped.
 */

type SetBits = React.Dispatch<React.SetStateAction<number>>;

export function PadRegister({ lang, bits, onChange }: { lang: Lang; bits: number; onChange: SetBits }) {
  const U = ui(lang).padStation;
  const LABEL = U.names;
  // -1: idle; 0: latched; 1..n: that many bits clocked out.
  const [step, setStep] = useState(-1);
  const [snap, setSnap] = useState(0);

  useEffect(() => {
    if (step < 0 || step > BUTTONS.length) return;
    const t = setTimeout(() => setStep((s) => (s >= BUTTONS.length ? -1 : s + 1)), step === BUTTONS.length ? 2600 : 700);
    return () => clearTimeout(t);
  }, [step]);

  const read = () => {
    setSnap(bits);
    setStep(0);
  };
  const reading = step >= 0;
  const held = reading ? snap : bits;
  const out = reading ? Math.max(0, step) : 0;

  return (
    <div className="pg-pad">
      <div className="pg-pad-buttons" aria-label={U.buttons}>
        {BUTTONS.map((name) => (
          <button
            key={name}
            className="pg-padkey"
            aria-pressed={(bits & BIT[name]) !== 0}
            onClick={() => onChange((was) => was ^ BIT[name])}
          >
            {LABEL[name]}
          </button>
        ))}
      </div>
      <p className="pg-note">{U.hold}</p>

      <div className="pg-shift" aria-live="polite">
        <div className="pg-shift-chip">
          <p className="pg-shift-h">{U.snapshot}</p>
          <ol className="pg-cells">
            {BUTTONS.map((name, i) => {
              const pressed = (held & BIT[name]) !== 0;
              const gone = reading && i < out;
              return (
                <li key={name} className="pg-cell" data-pressed={pressed} data-gone={gone} data-next={reading && step > 0 && i === out}>
                  <span className="pg-cell-name">{LABEL[name]}</span>
                  <span className="pg-cell-bit">{reading ? (pressed ? "0" : "1") : pressed ? U.held : ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="pg-shift-wire" data-live={reading && step > 0} aria-hidden="true">
          <span />
        </div>
        <div className="pg-shift-chip">
          <p className="pg-shift-h">{U.byte}</p>
          <ol className="pg-cells">
            {BUTTONS.map((name, i) => {
              const arrived = reading && i < out;
              const pressed = (held & BIT[name]) !== 0;
              return (
                <li key={name} className="pg-cell" data-pressed={arrived && pressed} data-empty={!arrived}>
                  <span className="pg-cell-name">{LABEL[name]}</span>
                  <span className="pg-cell-bit">{arrived ? (pressed ? "1" : "0") : ""}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="pg-row">
        <button className="pg-btn" onClick={read} disabled={reading}>
          {U.watch}
        </button>
        <p className="pg-readout">
          {step < 0
            ? U.ready
            : step === 0
              ? U.latch
              : step < BUTTONS.length
                ? U.tick(step, LABEL[BUTTONS[step - 1]], (snap & BIT[BUTTONS[step - 1]]) !== 0)
                : U.done}
        </p>
      </div>
    </div>
  );
}
