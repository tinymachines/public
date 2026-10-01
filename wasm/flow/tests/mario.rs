//! The flow tools held to a game somebody already took apart by hand:
//! Super Mario Bros. on the Super Mario Bros. + Duck Hunt cartridge, a
//! GxROM board, against nes-bench's `docs/mario-dissection.md` (served at
//! /docs/nes/mario-dissection). Every address below is that document's;
//! if the tools name different ones, the tools are wrong.
//!
//! A commercial cartridge's run is never committed, so this needs a trace
//! made here from the owner's own dump, with the dissection's script
//! (Start for the menu at 200, Start for the title at 330, Right from
//! 520, A from 570 to 590, Right released at 640; frames, where the
//! dissection counted latches, which is one a frame here):
//!
//!     cargo run --release -p nes-wasm --example record-replay -- \
//!         SMBDH.nes 700 "200:8,206:0,330:8,336:0,520:128,570:129,590:128,640:0" /tmp/smbdh
//!     FLOW_TRACE=/tmp/smbdh.trace cargo test --release --test mario -- --ignored
//!
//! (the first in the nes repository). Without FLOW_TRACE it is skipped
//! by name, never passed.

use serde_json::Value;

fn report() -> Value {
    let path = std::env::var("FLOW_TRACE").expect("FLOW_TRACE: a trace of the multicart; see this file's header");
    let bytes = std::fs::read(&path).expect("the trace");
    let mut f = flow::Flow::new(0x10000);
    for c in bytes.chunks(1 << 20) {
        f.feed(c);
    }
    serde_json::from_str(&f.report()).unwrap()
}

fn routines<'a>(r: &'a Value, entry: &str, addr: u16) -> Vec<&'a Value> {
    r["routines"].as_array().unwrap().iter().filter(|x| x["entry"] == entry && x["addr"] == addr).collect()
}

fn one<'a>(r: &'a Value, entry: &str, addr: u16) -> &'a Value {
    let v = routines(r, entry, addr);
    assert!(!v.is_empty(), "no {entry} routine at ${addr:04X}");
    v.into_iter().max_by_key(|x| x["entered"].as_u64()).unwrap()
}

#[test]
#[ignore = "needs FLOW_TRACE, a trace of the owner's own cartridge"]
fn the_tools_find_what_the_dissection_found() {
    let r = report();

    // "The main program ... is one instruction: JMP $8057 at $8057":
    // the loop with the most cycles, and it idles. On this board the same
    // address is the menu's too; the game's is at $57 in the PRG.
    let top = &r["loops"][0];
    assert_eq!(top["kind"], "idle");
    assert_eq!(top["head_addr"], 0x8057);
    assert_eq!(top["head"], 0x57, "the game's bank, not the menu's");

    // "The game is its NMI handler, entered at $8082".
    let nmi = one(&r, "nmi", 0x8082);
    assert!(nmi["entered"].as_u64().unwrap() >= 400);

    // The blank's routines, each from the handler at the site the
    // dissection's table gives.
    for (addr, site, tag) in [(0x8E5C, 0x80E7, "pad"), (0xF2D0, 0x80E4, "sound"), (0x8EDD, 0x80C3, "vram")] {
        let rt = one(&r, "call", addr);
        assert!(rt["tags"].as_array().unwrap().iter().any(|t| t == tag), "${addr:04X} is tagged {tag}: {}", rt["tags"]);
        assert_eq!(rt["callers"][0][0], nmi["id"], "${addr:04X} is called by the handler");
        assert_eq!(rt["callers"][0][1], site, "${addr:04X} from ${site:04X}");
    }

    // "One jump engine at $8E04": the operation-mode tree dispatches at
    // $8215 to $8231 (the title) and then $AEDC (the game).
    let d = r["dispatch"].as_array().unwrap().iter().find(|d| d["addr"] == 0x8215).expect("a dispatch at $8215");
    let target = |id: &Value| r["routines"][id.as_u64().unwrap() as usize]["addr"].as_u64().unwrap();
    let order: Vec<u64> = d["timeline"].as_array().unwrap().iter().map(|t| target(&t[2])).collect();
    let title = order.iter().position(|&a| a == 0x8231).expect("the title");
    let game = order.iter().position(|&a| a == 0xAEDC).expect("the game");
    assert!(title < game, "the title before the game: {order:x?}");

    // "LDA $2002 / AND #.. / BEQ spun 178 times: waiting for sprite 0" at
    // $8150, in the handler.
    let wait = r["loops"].as_array().unwrap().iter().find(|l| l["head_addr"] == 0x8150).expect("the sprite-0 wait");
    assert_eq!(wait["kind"], "wait");
    assert_eq!(wait["on"], 0x2002);

    // "$B376 in the air": the routine that runs while A is held.
    let a = r["input"].as_array().unwrap().iter().find(|b| b["button"] == "A").expect("A was held");
    let held: Vec<u64> = a["while_held"].as_array().unwrap().iter().map(|x| target(&x[0])).collect();
    assert!(held.contains(&0xB376), "A held runs $B376: {held:x?}");

    // The menu, the title, the transition and play are told apart.
    assert!(r["modes"]["modes"].as_array().unwrap().len() >= 4);
}

/// Not the dissection's: what following values found on 2026-10-01, kept
/// so it stays found. Two bytes of RAM that each reach a sprite's X
/// byte, never the same one together, are compared in one called
/// routine; the byte that reaches every sprite's X with them (the
/// camera) meets nothing.
#[test]
#[ignore = "needs FLOW_TRACE, a trace of the owner's own cartridge"]
fn two_positions_meet_and_the_camera_does_not() {
    let r = report();
    let fed_x = |cell: u64| r["sprite_feeds"].as_array().unwrap().iter().any(|f| f[0] == cell && f[2].as_u64().unwrap() > 0);
    for cell in [0x86, 0x87, 0x071c] {
        assert!(fed_x(cell), "${cell:04X} reaches a sprite's X");
    }
    let meets = r["meets"].as_array().unwrap();
    assert!(!meets.is_empty());
    let mut routines: Vec<u64> = Vec::new();
    for m in meets {
        let pairs = m["pairs"].as_array().unwrap();
        assert!(pairs.iter().any(|p| p[0] == 0x86 && p[1] == 0x87 && p[3].as_str().unwrap().contains('x')), "{m}");
        assert!(!pairs.iter().any(|p| p[0] == 0x071c || p[1] == 0x071c), "the camera is not an object: {m}");
        routines.push(m["routine"].as_u64().unwrap());
    }
    routines.dedup();
    assert_eq!(routines.len(), 1, "one routine holds them all");
    assert_eq!(r["routines"][routines[0] as usize]["entry"], "call");
}
