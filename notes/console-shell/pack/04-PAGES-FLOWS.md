# 04: Pages & Flows

## Pages (swipe order)

1. **Gameplay**: screen + docked controls. Swipe gesture lives on the
   glass (mask area); rail dots mirror position.
2. **Shelf**: cartridge collection. Drag cart up into slot to load.
3. **Status / Inventory**: HUD chips expanded; per-cartridge panels.
4. **Settings**: CRT filter toggle, scanline intensity slider, PAL/NTSC
   visual switch, rewind buffer size, achievements list, palette loader.
5. **Map**: optional, only if the loaded cartridge declares it.

Swipe must never conflict with gameplay input: on the Gameplay page, swipe
requires a 2-finger drag or an edge-start (from bezel onto glass) , 
pick one during M4 prototyping, file the decision.

## Machine states

```
OFF ──power──▶ BOOT(amber LED, flicker wipe ×4 frames)
BOOT ──cart present──▶ LIVE(red LED)
BOOT ──no cart───────▶ SHELF page (prompt)
LIVE ──power tap─────▶ PAUSED (screen dims 1 step, HUD "PAUSE")
LIVE ──reset─────────▶ BOOT
LIVE ──game over,credits>0──▶ CONTINUE? (coin slot pulses)
LIVE ──game over,credits=0──▶ INSERT COIN attract loop
```

Coin flow: tap acceptor → coin drop animation → credits++ → slot pulse
stops. Credits displayed on 7-seg counter; persist per session.

Cartridge flow: drag cart from shelf → slot mouth highlights → release →
cart seats (2-frame nudge) → detect LED on → BOOT. Loading a cart applies
its theme: label accent, panel palette swap, optional custom screen palette.

## Boot/attract details

- Flicker wipe: 4 stepped frames of horizontal band polygons (no blur).
- Attract loop: marquee text scroll on header + shelf dots pulse.
- Achievement pop: 8-bit banner slides from title-safe top edge, 3 s,
  never over action-safe center.

## Rewind buffer (Settings toy)

Hold reset = scrub back through last N snapshots (N from settings, small).
Visual: screen shows stepped "tape" frames with 45° shear polygons: the
one place shear transforms are allowed, and only as a whole-group transform
(geometry itself stays orthogonal for slicing).
