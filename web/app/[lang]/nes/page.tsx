import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { project } from "@/lib/projects";
import { nes } from "@/lib/nes";
import Image from "next/image";
import { Shell } from "@/app/components/SiteFrame";
import "./nes.css";

/**
 * /nes: the fourth project gets a roof.
 *
 * The console arc as a measurement report: what exists, what each gate
 * proved, and the milestones between here and a bootable console. Its
 * figures are slots filled from data/nes.json, which only
 * scripts/board-nes.py writes, and it writes only what it measured by
 * running the chip repository's own suite and MUTATE run at a pinned
 * commit. No number on this page is typed.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes");
}

const PROSE = {
  en: {
    kinship: (
      <>
        <Link href="/6502">The 6502 work</Link> simulates a chip at its
        switches; <Link href="/ntsc">ntsc-crt</Link> simulates the signal
        between a console and a tube. This project is where they stop being
        neighbours and become one machine: a working NES assembled chip by
        chip, with the contracts between the chips proven by recorded
        reference traces rather than promised by documentation.
      </>
    ),
    contractsH: "The chips share one contract, and a lie about a pin fails the tests",
    contracts: (busHref: string, ppuHref: string) => (
      <>
        <a data-address href={busHref}>nes-bus</a> holds the frame types and
        pin tables every chip crate speaks, dependency-free. These are not
        just compile checks: the PPU&rsquo;s (
        <a data-address href={ppuHref}>2c02</a>) recorded reference run now
        replays through the contract&rsquo;s pin frames, and a built-in
        sabotage that lies about one pin&rsquo;s polarity must make it
        fail.
      </>
    ),
    fifthH: "The fifth chip matches its reference exactly, with no list of exceptions",
    fifth: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        <a data-address href={repoHref}>2a03</a> is the NES CPU: a 6502
        core, the clock divider, the audio units, all
        {" "}{r.a0.transistors} transistors over {r.a0.defined_nodes} defined
        nodes, counted identically by two independent parsers. Its recorded
        run replays against the reference simulator bit for bit across{" "}
        {r.a0.golden_states} states with no list of exceptions at all, the
        first chip in the family to
        manage it. Getting there settled a question the engine had carried
        since its first release: the 2A03 forms {r.a0.contested_groups}{" "}
        contested groups at power-on where a layout pull fights an external
        drive, the first nonzero count on any chip, and halfphi{" "}
        {r.halfphi} resolves them the way the silicon does, with the change
        proven unobservable on every other chip.
      </>
    ),
    soundH: "First sound, and the note is exactly the program's",
    sound: (r: ReturnType<typeof nes>) => (
      <>
        A small program of ours runs on the chip through a memory harness
        and makes the square channel sing. The reference&rsquo;s own run of
        the same program replays through the harness bit for bit over{" "}
        {r.first_sound.golden_states} states: the core, the audio units and
        the bus glue under one comparison. And we measured the note itself
        rather than assuming it: the channel&rsquo;s output swings in
        plateaus of exactly{" "}
        {r.first_sound.plateau_half_steps} half-steps, {r.first_sound.plateaus_measured}{" "}
        of them counted, and {r.first_sound.plateau_half_steps} comes
        straight from the program&rsquo;s own timer byte ({r.first_sound.timer_byte}).
        As sabotage, the test harness serves that byte wrong, and both
        checks fail: the replay at the byte&rsquo;s first bus crossing, and
        the plateau count at exactly the number the wrong byte predicts.
      </>
    ),
    soundAlt:
      "Two aligned traces: the square channel's 4-bit output code swinging between 0 and 15 in regular plateaus, and the same run mixed to the AD1 pin's level.",
    soundCaption: (r: ReturnType<typeof nes>) => (
      <>
        The trace we measured: sq0_out sampled every CPU half-step off the
        running chip, and the same run through the transcribed mixer as the
        AD1 pin&rsquo;s level ({r.first_sound.ad1_high} at the top).
        The mixer constants are the nesdev wiki&rsquo;s; we have not yet
        put them on the bench ourselves.
      </>
    ),
    cornersH: "The PPU's contested corners, pinned by crafted traces",
    corners: (r: ReturnType<typeof nes>, ppuHref: string) => (
      <>
        The questions emulator folklore argues about were each answered
        by a scripted register program on the switch-level PPU (
        <a data-address href={ppuHref}>2c02</a>), with the reference
        simulator running the same script blindly and dumping every node
        inside the windows that matter. Sprite 0 hits at line{" "}
        {r.c2c02.p2.hit_vpos}, dot {r.c2c02.p2.hit_hpos}, the sprite&rsquo;s
        own x plus the two-dot pipeline, and the two sprite windows replay
        node for node over {r.c2c02.p2.sprite_states} states with no
        exceptions. The famous missed-vblank window measures about a dot
        and a half wide, and three reads across the flag&rsquo;s rise
        return bit 7 as {r.c2c02.p2.race_bits} (miss, suppress, consume),
        cross-checked against the reference&rsquo;s own sampled data bit.
        OAM showed no corruption under either documented trigger.
      </>
    ),
    enginesH: "Two engine divergences, both found by the chips and fixed in the engine",
    engines: (r: ReturnType<typeof nes>) => (
      <>
        Getting sprite 0 to hit at all exposed the first: the OAM data
        lines the reference special-cases when a group holds both rails,
        which the engine had been crushing to zero; halfphi 0.1.5 carries
        the fix as a generic hold with an area-weighted charge vote, the
        reference&rsquo;s own rule. The second hid until a palette write
        was paced the way a real CPU paces it: the byte landed ORed with
        the address low byte on our engine and as written on the
        reference, and the cause turned out to be how an undriven group
        resolves. The 2C02&rsquo;s reference weighs the members&rsquo;
        areas; visual6502 lets any one charged member win. halfphi{" "}
        {r.c2c02.halfphi} lets a netlist declare which, and with the vote
        declared the PPU&rsquo;s two recorded reference runs replay with
        no exceptions at all: {r.c2c02.p0_states} states from power-on
        and {r.c2c02.p1_states} states through the bus harness, every one
        of {r.c2c02.nodes} nodes. The {r.c2c02.masked_latches_p0} and
        then {r.c2c02.masked_latches_p1} latches those runs had
        masked as undefined power-on state were the charge rule, not the
        silicon. A check now holds the declaration, and building the chip
        under the old rule turns that check red.
      </>
    ),
    ladderH: "The fast PPU matches the chip dot for dot, well inside the frame period",
    ladder: (r: ReturnType<typeof nes>) => (
      <>
        The fast PPU is not a second model of the chip. Its sequencer is
        a table measured out of the switch-level chip at build time, one
        event word per dot of a frame: which fetch the chip latched, when
        it stepped its address, when it copied the scroll, when the flag
        rose. Only the datapath is authored, and it is held to the
        chip&rsquo;s own frames: {r.c2c02.p3.visible_dots} visible dots
        agree with the switch-level render on the first world, all{" "}
        {r.c2c02.p3.sprite_dots} on a world of 64 sprites (flips, priority,
        nine on one line, the sprite-0 hit landing at (
        {r.c2c02.p3.hit_line}, {r.c2c02.p3.hit_pixel}) where the chip&rsquo;s
        own flag rose at dot {r.c2c02.p3.chip_hit_hpos}), and all{" "}
        {r.c2c02.p3.scroll_dots} on a scrolled world with five register
        writes landing mid-frame, each inside its bus access (a plateau at
        dots {r.c2c02.p3.write_delay_plateau} after the access starts).
        It renders a frame in {r.c2c02.p3.mean_ms} ms against the{" "}
        {r.c2c02.p3.frame_period_ms} ms frame period, {r.c2c02.p3.mean_inside_x}{" "}
        times inside it, worst frame {r.c2c02.p3.worst_ms} ms, over{" "}
        {r.c2c02.p3.frames_timed} frames.
      </>
    ),
    sequencerAlt:
      "A timing chart of one PPU scanline: rows for the nametable, attribute and pattern fetches and for the address increments, copies and sprite evaluation, with a tick at each dot the switch-level chip fires them.",
    sequencerCaption: (
      <>
        One scanline of the chip&rsquo;s internal schedule, read off the
        switches themselves. Each row is a control signal the fast PPU
        is built from, and each tick marks a dot where the real chip
        fired it: fetches in blue, address and sprite events in red. It
        is a measurement, not a redrawing of a diagram.
      </>
    ),
    worldsAlt1:
      "The sprite world as the switch-level PPU drew it, through the family's NTSC path: 64 sprites over an XOR-patterned background on a simulated CRT.",
    worldsAlt2:
      "The scroll world as the switch-level PPU drew it: a scrolled XOR-patterned background with visible breaks where mid-frame register writes changed the scroll.",
    worldsCaption: (
      <>
        Two of the test pictures the fast PPU has to reproduce. The
        switch-level chip drew them, and they are shown the way a TV
        would show them, encoded to composite and decoded onto a
        simulated CRT. They look like noise on purpose: every tile is
        computed from its own position, so a single wrong dot has
        nowhere to hide. The two breaks across the scroll world are
        deliberate too, scroll changes written mid-frame. The fast PPU
        gets both pictures right to the dot.
      </>
    ),
    pinsH: "The 2A03's core at the 6502's pins, chip against chip",
    pins: (r: ReturnType<typeof nes>) => (
      <>
        The console sketch calls for a new kind of check, chip against
        chip through the contract, and both halves now exist. The
        2A03&rsquo;s 6502 core is presented as a pin frame of the 6502
        project&rsquo;s own contract crate, one per clock phase, and then
        run through every trace in the 6502&rsquo;s recorded pin runs
        ({r.n3.golden_traces} of them: seven programs, the reference&rsquo;s
        program, the scripted interrupt and RDY runs, three decimal-mode
        chains, all 256 opcodes), the other chip entering as recorded text
        and never as an engine. {r.n3.traces_compared} traces compare
        ({r.n3.traces_refused} drive pins the 2A03 does not have and are
        refused by name), {r.n3.traces_exact} of them exact in every field
        at every half-cycle, and the rest differ only inside four named
        and bounded classes: the stack page (the two dies&rsquo; simulated
        power-on stack pointers differ by ${r.n3.stack_offset_hex}, derived
        from both cores&rsquo; own registers), the data byte in a
        write&rsquo;s phi1 half (nothing is serviced there), the decimal
        chains, where the 2A03 stores the binary sums and binary flags the
        6502 adjusts, {r.n3.decimal_stores} bytes listed with their
        arithmetic, and a mid-run reset, where the 2A03 holds its core
        still under RES while the 6502 runs on, both reading the vector at
        the same half-cycle. That list decided the shape of the 2A03&rsquo;s
        own fast core: the 6502&rsquo;s fast core with its decimal adjust
        disconnected and its stack pointer seeded from this chip, two knobs
        landed in the 6502 repository and held to its recorded runs there. Against
        the switch-level 2A03 on every program and script:{" "}
        {r.n3.core_programs} programs, {r.n3.core_half_cycles} half-cycles,
        the write-phi1 byte the one difference left.
      </>
    ),
    apuH: "The APU as tables, held to the chip at every half-step",
    apu: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        The sound side follows the PPU&rsquo;s pattern: tables measured out
        of the switch-level chip at build time, machinery authored around
        them from headless probes, the whole held to the chip&rsquo;s own
        output. The probes came first, eleven measurements kept as
        instruments (the frame sequencer in both modes, the length table,
        the duty sequences, the envelope and sweep clocks, the triangle,
        the noise and DMC period tables, the sprite DMA, the controller
        strobes), and they found two things the published model does not
        say. The noise and DMC timers are not counters but linear feedback
        shift registers, free-running from power-on, each reloading one of
        sixteen recorded states when it reaches a terminal: the die&rsquo;s
        period ROMs, and the noise ROM&rsquo;s index 12 lands at{" "}
        {r.n3.noise_index12_die} cycles where every published table says{" "}
        {r.n3.noise_index12_published}, either a transcription defect in
        the die data or a quirk of the part, named and carried. Every
        timing inside a unit is a fitted constant measured with a probe
        the first time the authored stream and the chip&rsquo;s parted: a low-byte period
        write makes the next tick a reload, a square&rsquo;s code lags its
        step by two half-steps, the DMC&rsquo;s output unit counts eight
        completions from power-on before it speaks. The check is two
        register programs under both frame modes, {r.n3.apu_worlds} worlds
        of {r.n3.apu_half_steps} half-steps each, the five output codes and
        the frame IRQ flag identical to the switch-level chip at every
        half-step. Then the stalls: the whole chip at the pins, its DMA
        units taking the bus, against the switch-level chip frame for frame
        with RDY compared like any other field, a sprite DMA at both write
        alignments ({r.n3.dma_frames} frames each, RDY low on{" "}
        {r.n3.dma_rdy_low_even} and {r.n3.dma_rdy_low_odd}) and the
        DMC&rsquo;s sample fetches ({r.n3.dmc_frames} frames, RDY low on{" "}
        {r.n3.dmc_rdy_low}). With everything attached the chip runs at{" "}
        {r.n3.half_cycles_per_s} half-cycles a second, {r.n3.real_time_x}{" "}
        times real time. The account, step by step, is{" "}
        <a href={`${repoHref}/blob/main/docs/n3-report.md`}>the N3 report</a>.
      </>
    ),
    apuAlt: "Five stacked traces over 22 milliseconds of 2A03 time: two squares, the triangle, the noise and the DMC output codes, with the frame IRQ marked",
    apuCaption: (r: ReturnType<typeof nes>) => (
      <>
        The five output codes over the long-note test world,{" "}
        {r.n3.apu_half_steps} half-steps: the authored APU&rsquo;s streams,
        which the check held identical to the switch-level chip&rsquo;s at
        every one of them. Square 1 sweeps up to its mute, square 0&rsquo;s
        envelope starts at the first quarter frame, the noise&rsquo;s LFSR
        waits out its timer&rsquo;s power-on lap, the DMC walks a 33-byte
        sample; the vertical line is the frame IRQ.
      </>
    ),
    mApuHalfSteps: (n: number, w: number) => <>APU check: <b>{w} worlds, {n} half-steps each, identical</b></>,
    mStalls: (n: number) => <>stall check: <b>{n} frames identical, RDY included</b></>,
    mRealTime: (x: string) => <>with the APU attached: <b>{x}x real time</b></>,
    consoleH: "Both chips on one clock, and the standard test ROMs run with a real CPU attached",
    console: (r: ReturnType<typeof nes>) => (
      <>
        The glue came first: the NES-001 mainboard&rsquo;s handful of
        parts, the address decoder, the PPU&rsquo;s address latch, the two
        RAMs, the controller port buffers with the controller behind them,
        the reset chain, each a few lines held to its datasheet by its own
        test and labelled authored, since nothing there goes through a
        netlist. Two of them were authored wrong the first time and the
        tests said so. Then the console: the 2A03&rsquo;s fast core and
        the fast PPU on one master half-step counter, the CPU advancing
        every twelve and the PPU every eight, at the alignment measured
        off the two switch-level chips&rsquo; own clock dividers
        (cpu_phase {r.console.alignment.cpu_phase}, ppu_phase{" "}
        {r.console.alignment.ppu_phase}, one of{" "}
        {r.console.gate1.alignments} the dividers can power up in, and
        the one the run stamps). The plumbing check runs a test cartridge
        for {r.console.plumbing.frames} frames and holds the master
        counter to eight per dot, the odd frames a dot short, the picture
        to the standalone PPU&rsquo;s, and the NMI count in RAM to one a
        frame. It runs at {r.console.frames_per_s[0]} to{" "}
        {r.console.frames_per_s[1]} frames a second on one core,{" "}
        {r.console.real_time_x[0]} to {r.console.real_time_x[1]} times
        real time. The alignment check then holds the seam the whole arc
        was about, two ways. The PPU&rsquo;s real NMI is made to land
        around a BRK at {r.console.gate1.nmi_offsets} offsets a cycle
        apart, and the console&rsquo;s CPU is compared with the
        switch-level 6502 driven by the same edge, half-cycle for
        half-cycle: {r.console.gate1.nmi_half_cycles} of them agree, the
        vector taken, the pushes, the timing. And the $2002 read race is
        measured on the switch-level PPU at every half-step with the
        console&rsquo;s own access shape, then the console&rsquo;s reads
        are held to that table under all {r.console.gate1.alignments}{" "}
        alignments: {r.console.gate1.race_reads_set} reads around the
        flag&rsquo;s set and {r.console.gate1.race_reads_clear} around
        its clear, every half-step of both windows reached, every
        outcome the chip&rsquo;s.
        {" "}Then the check the whole arc was built toward, against
        something real: blargg&rsquo;s test ROMs through the entire
        console, the first real programs the fast chips had run for
        millions of cycles. The CPU timing
        test passes; {r.console.blargg.instr_pass} of{" "}
        {r.console.blargg.instr_total} instruction tests pass, every
        official and unofficial opcode; {r.console.blargg.sprite_pass} of{" "}
        {r.console.blargg.sprite_total} sprite-hit tests pass
        {r.console.blargg.sprite_pass === r.console.blargg.sprite_total
          ? ", the double-height one since the fast PPU's tall-sprite rule was measured on the switch-level chip and held dot for dot"
          : ", the one left refused by name (tall sprites are not modelled)"}
        ;{" "}
        {r.console.blargg.vbl_nmi_pass} of {r.console.blargg.vbl_nmi_total}{" "}
        vblank and NMI timing tests pass, the rest one or two dots from
        the documented console and all one question: its NMI reaches the
        CPU about two dots later than the two chips, each held to its own
        measured timing, allow, and a scope on the real board is what
        settles it;{" "}
        {r.console.blargg.apu_pass} of {r.console.blargg.apu_total} APU
        tests pass, six of them only after each miss was measured on the
        switch-level 2A03 and authored there: the $4017 write&rsquo;s
        parity jitter and its immediate clock, a status latched a
        half-step after the bus is asked, an IRQ flag that stays set for
        three cycles, and a DMC byte counted off where its read lands. What the ROMs found is the
        point of running them: the fast CPU had replayed
        every recorded trace exactly and still carried misses no trace
        had covered (a carry that rides an undriven bus line into the
        next instruction, a shift&rsquo;s carry read from the wrong
        capture, three opcodes whose result is a bus fight the switch
        model settles its own way, the half-cycle at which an interrupt
        input is sampled, which the alignment check caught, and a byte
        latched later than the bus is asked for it), and the fast PPU
        four more. Each
        was located by running the switch-level chip and its fast
        counterpart in lockstep on the ROM until they disagreed, measured on the chip,
        then authored and held by a fixture that goes red without it. The
        account is{" "}
        <a href={`${r.console.repo}/blob/main/docs/n5-report.md`}>the N5 report</a>;
        the play test waits on a cartridge.
      </>
    ),
    pictureH: "The console's frames through the television model, and a capture of them scored",
    picture: (r: ReturnType<typeof nes>) => {
      const p = r.console.picture;
      const c = p.capture;
      const rowKeys = ["1", "2", "3", "0"] as const;
      const rowsEn = rowKeys.map((k, i) => {
        const row = c.rows[k];
        return (
          <span key={k}>
            luma row {k}: {row.within_all} of {row.regions} regions hold all three (worst luma {row.worst_luma}, hue {row.worst_hue_deg} degrees, saturation {row.worst_sat}, rate found to {row.recovered_ppm} ppm)
            {i < rowKeys.length - 1 ? "; " : ". "}
          </span>
        );
      });
      return (
        <>
          The picture is ntsc-crt&rsquo;s chain ({p.ntsc_crt}, pinned by
          tag) with two things added by the console: the order of the
          frames and the subcarrier phase carried from one to the next,
          which the odd frame&rsquo;s short line moves, so the console
          hands over its parity and not just its dots. Each frame is
          encoded by the NES source, decoded on the three-line comb and
          run through the CRT stages at their authored parameters. Two
          checks hold it: a console frame through that chain is the
          standalone fast PPU&rsquo;s frame from the same world through
          the same chain on every decoded sample ({p.components_equal}{" "}
          components equal, a {p.parity} frame, {p.displayed[0]} by{" "}
          {p.displayed[1]} on the screen), and the phase after{" "}
          {p.phase_frames} console frames, {p.phase_short} of them short,
          is what the grid&rsquo;s arithmetic gives that sequence
          (phase {p.phase}; forcing every frame even reads differently
          and turns the check red). The bars cartridge the real comparison
          wants paints with the PPU&rsquo;s rendering off, which the fast
          PPU had never been asked about: measured on the switch-level
          chip, the picture with rendering off is the palette entry the
          address register points at, and its timing against a mid-line
          write is now a fixture there.
          {" "}Then the capture path, the machine half of the comparison
          the real console will join: a bars cartridge through the
          console, its frames through ntsc-crt&rsquo;s capture-card model
          and recovered exactly as a real record is, the synthesis
          through the model&rsquo;s own front end so both sides carry the
          same band limit, then every flat region scored against that
          synthesis through the identical decoder, {c.margin_dots} dots
          in from its edges, a distance derived from the decoder&rsquo;s
          chroma filter rather than chosen. The tolerances were written
          down before the run: luma within {c.tol_luma}, hue within{" "}
          {c.tol_hue_deg} degree, saturation within {c.tol_sat_pct}{" "}
          percent. The cartridge is the repository&rsquo;s own, since
          blargg&rsquo;s bars are sixteen dots wide and the decoder settles
          in five: thirty-two-dot cells of the twelve hues at one luma row
          and the backdrop, the row stepping every two seconds, scored one
          run per row.{" "}
          {rowsEn}
          {c.held ? "The roundtrip closes." : "The roundtrip does not close."}{" "}
          The first runs found the instrument three times before the
          scoring&rsquo;s own geometry: a level re-referencing a histogram
          bin coarse, a dark picture taken for blanking, and the darkest
          colours&rsquo; chroma troughs taken for sync edges, each fixed
          in ntsc-crt and re-pinned. The real record of the same
          cartridge on the real console is the bench item, and the
          cartridge exists for it now; the account is{" "}
          <a href={`${r.console.repo}/blob/main/docs/n6-report.md`}>the N6 report</a>.
        </>
      );
    },
    consoleSoundH: "The console's sound through the board's audio stage, held to blargg's mixer tests and set beside his recordings",
    consoleSound: (r: ReturnType<typeof nes>) => {
      const s = r.console.sound;
      const roms = ["square", "triangle", "noise", "dmc"] as const;
      return (
        <>
          The 2A03&rsquo;s five output codes leave the chip after every
          CPU half-cycle and go through the two DACs, the nesdev table
          the family has carried since first sound, authored and labelled
          so. What happens next is on the NES-001 schematic, read
          directly: each audio pin pulled down by 100 ohms (the
          table&rsquo;s own &ldquo;plus 100&rdquo;), the two pins summed
          through 20K and 12K (the ratio the table&rsquo;s two constants
          already carry), a coupling capacitor into a 74HC04 inverter
          held linear by a 47K feedback resistor with 220 pF across it.
          So, to the jack: a high-pass with a time constant of{" "}
          {s.stage.tau_hp_ms} ms, a gain of {s.stage.gain} with the
          inverter&rsquo;s sign, a low-pass at {s.stage.tau_lp_us}{" "}
          microseconds, then a windowed-sinc resampler to 48 kHz at the
          exact rational times. The stage is held to that arithmetic (a
          step decays by {s.stage.step_ratio} per time constant, a 10 kHz
          tone against a 200 Hz one comes through at{" "}
          {s.stage.tone_ratio} where the values give{" "}
          {s.stage.tone_expected}). Not modelled and said so: the
          inverter&rsquo;s finite open-loop gain and its rails, and the
          table&rsquo;s absolute volts, which is one scale factor a
          scope record supplies.
          {" "}The check against real hardware is blargg&rsquo;s: four
          mixer ROMs, each
          playing a channel while the DMC plays its inverse, so a right
          mixer cancels to near silence between two reference beeps.
          Each ran through the whole console; the worst 100 ms window
          of each test, as a share of the beep, must stay under{" "}
          {s.tolerance_pct} percent (the DMC&rsquo;s step alone is about
          two), the noise ROM held on its tone since it fades noise by
          design. Console, then blargg&rsquo;s recording of the same ROM
          on real hardware measured by the same code:{" "}
          {roms.map((k, i) => (
            <span key={k}>
              {k} {s.roms[k].rms_pct} percent against {s.roms[k].rec_rms_pct}
              {i < roms.length - 1 ? "; " : "."}
            </span>
          ))}
          {" "}Triangle and noise agree with the real console to a
          fraction of a percent. Square and dmc carry twice the
          console&rsquo;s residual on real hardware, and that residual is
          a tone: the real pulse and DMC DACs depart from the
          table&rsquo;s curves by more than the table departs from
          blargg&rsquo;s inverse, which is the scope&rsquo;s question and
          is recorded, not held. Mixing through the wiki&rsquo;s linear
          approximation instead turns the check red, at a third of the beep.
          The account is{" "}
          <a href={`${r.console.repo}/blob/main/docs/n7-report.md`}>the N7 report</a>;
          the AUDIO_OUT record is the bench item.
        </>
      );
    },
    shellH: "The console in a window, its picture on the GPU held to the CPU chain, and a second target in the browser",
    shell: (r: ReturnType<typeof nes>) => {
      const s = r.console.shell;
      const g = s.gpu.authored;
      const m = s.gpu.mask_and_geometry_on;
      const p = s.pacing;
      const w = s.wasm;
      return (
        <>
          A frame&rsquo;s time on one core was measured before anything
          was written, and it said where the work had to go: the console
          and the encoder fit a core, and the comb decode with the five
          CRT stages did not fit anywhere on the CPU. Those two are now
          eight compute passes on the GPU, every constant uploaded from
          the decoder and the CRT parameters rather than typed, and they
          are held to the signal path&rsquo;s own CPU chain on every
          component of every pixel of three consecutive frames, the last
          one black so that persistence shows. With the authored
          parameters the worst component differs by {g.worst.toExponential(1)}{" "}
          and the mean by {g.mean.toExponential(1)}; with the mask and the
          geometry switched on, {m.worst.toExponential(1)} and{" "}
          {m.mean.toExponential(1)}; the tolerance stated first was{" "}
          {s.gpu_tolerance.worst} and {s.gpu_tolerance.mean}. A frame
          takes {g.ms_per_frame} ms on the {g.adapter}, upload included.
          Skipping persistence turns the check red.
          {" "}The window is a Linux binary: the console with its sound
          on its own thread, advanced by whole frames per period as the
          signal path&rsquo;s drift policy decides from the wall clock,
          duplicates and drops counted and never resampled in time; the
          display encodes each new frame and runs the GPU picture; sound
          through the audio device; the keyboard, and a gamepad through
          gilrs, as controller 1. The
          loop is held on a synthetic clock: at exactly the period{" "}
          {p.at_period.ticks} ticks run {p.at_period.new} new frames with{" "}
          {p.at_period.duplicated} duplicate and {p.at_period.dropped}{" "}
          drops; at half the period {p.at_half.duplicated} of{" "}
          {p.at_half.ticks} ticks present the previous frame again; at
          twice it drops {p.at_twice.dropped} in {p.at_twice.ticks}. It
          ran under a virtual display on this box; a real screen, a
          speaker and a hand are the desk items.
          {" "}The second target is the browser: the console with its
          sound behind wasm-bindgen, measured under node on {w.rom}:{" "}
          {w.frames} frames in {w.seconds} s, {w.frames_per_s} frames a
          second, {w.real_time_x} times real time, {w.sound_per_frame}{" "}
          sound samples a frame. That target has a page now:{" "}
          <Link href="/nes/play">the console runs here</Link>, on a
          cartridge from your own disk, through the same signal path the
          ntsc bench runs, with the drift counters shown raw. The
          account is{" "}
          <a href={`${r.console.repo}/blob/main/docs/n8-report.md`}>the N8 report</a>.
        </>
      );
    },
    mConsoleTests: (n: number) => <>nes suite: <b>{n} tests green</b></>,
    mConsoleInstr: (p: number, t: number) => <>instruction tests: <b>{p} of {t} pass</b></>,
    mConsoleRate: (lo: string, hi: string) => <>the console: <b>{lo} to {hi}x real time</b></>,
    mConsoleCommit: (commit: string, href: string) => (
      <>nes commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "The bench: the part and the model under one input history",
    bench: (r: ReturnType<typeof nes>) => (
      <>
        With every machine milestone closed, what the console does not
        yet know about the part waits on a bench, and the bench is the
        next thing built. A bridge sits between the console&rsquo;s
        controller port and an original pad: a shift register on the
        bridge is the pad the console clocks, a microcontroller writes
        its inputs between polls and counts the console&rsquo;s latch
        and clock pulses in hardware, and a Raspberry Pi on the LAN
        takes scripts, drives the reset and power relays and triggers
        the scope. Scripts are bytes by latch index, so the model and
        the part see one history; the bridge&rsquo;s per-latch log and
        the model&rsquo;s are diffed latch for latch, and a triggered
        capture is scored through the same roundtrip the picture
        milestone closed on. The plan names four milestones with their
        checks before any firmware, and the first, the sniff, already
        moved the model: asked what a DMC fetch does to a pad read, the
        switch-level 2A03 answered before the part could, and the core,
        the fast chip and the console changed for it, each change held
        by a sabotage test that goes red without it. Every milestone&rsquo;s
        tool now exists ahead of its hardware, from the head that plays a
        script onto the bridge, the relays and the scope, to the bisection
        that finds the first poll at which the part and the model
        disagree, each proved against a stand-in by a sabotage test that
        goes red without it. The drawing below is derived from the
        wiring tables by a script, so it cannot disagree with them. Plan,
        wiring, the script and the running report are in{" "}
        <Link href="/docs/nes">the notebook</Link>; the repository is{" "}
        <a data-address href={r.family.bench}>{r.family.bench.replace("https://", "")}</a>.
      </>
    ),
    benchAlt: "The bench as one drawing: the loop above (workstation, Pi, bridge, console, pad, scope, relays) and the bridge's chips with every pin below.",
    benchCaption: "The bench, derived from its wiring tables: the loop, and the bridge with every pin. Nothing in it is built yet.",
    sheetAlt: "The bridge as a schematic, v1: the console port, the inverter and the shift register at the console's five volts, the level shifter and the ESP32-C6 at three volts three, the pad socket, and the head with its relays and the scope.",
    sheetCaption: "The same bridge as a schematic, from the bench's electronics review: net labels, three supplies, one ground, held to the wiring tables by a check. The build order and the extended bridge are in the notebook.",
    timingAlt: "One controller poll as timing lanes: the latch pulse and the register's load window, the eight clock pulses, the data line, what each hardware counter counts, the microcontroller's loop, and where a write is safe.",
    timingCaption: "One poll on the part as timing lanes: the load window the register's inputs must not change in, what the two counters count, and where the bridge may write. Every width is authored until the scope replaces it.",
    boardedH: "Every number here comes from re-running the tests",
    boardedIntro: (date: string) => (
      <>
        The figures below come from running both chip repositories&rsquo;
        own suites again on {date}, with their netlists and every recorded
        reference run required, plus their MUTATE=1 runs, all at the
        recorded commits; this page reads only what those runs wrote.
      </>
    ),
    mTests: (n: number) => <>suite: <b>{n} tests green</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} tests red</b></>,
    mHalfphi: (v: string) => <>halfphi: <b>{v}</b></>,
    mCommit: (commit: string, href: string) => (
      <>commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    mPpuTests: (n: number) => <>2c02 suite: <b>{n} tests green</b></>,
    mPpuReds: (n: number) => <>2c02 MUTATE=1: <b>{n} tests red</b></>,
    mPpuCommit: (commit: string, href: string) => (
      <>2c02 commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    aheadH: "What the sketch asked for, and what still waits on the part",
    ahead: (sketchHref: string) => (
      <>
        The plan was written down first:{" "}
        <a href={sketchHref}>the end-to-end sketch</a> in the contract
        repository, with a check per milestone. Every milestone it names
        is built and checked on this machine: the contract, the two chips
        at the switch level and the fast chips built from them, the fast
        2A03 assembled whole, the glue, the console on one clock running the standard suites,
        the picture through the encoder and back through the capture
        path, the sound through the board&rsquo;s own stage, and the
        shell with its GPU picture, its gamepad and its browser target.
        What is left is exactly what a switch-level model cannot settle
        alone, and each item is named in the reports: the NMI&rsquo;s
        arrival timing on a real board, a real cartridge in the play
        test, the terminated capture the picture milestone asked for, the
        sound stage under a real speaker, the alignment the console
        powers on in, and the die&rsquo;s own findings, where the model
        and the part are known to disagree and a logic analyser decides.
        The bench above is how those close. The signal side is already
        real: <Link href="/ntsc">the ntsc page</Link> carries frames
        decoded from a physical console, and{" "}
        <Link href="/ntsc/composite">its composite deep-dive</Link> reads
        that console&rsquo;s video off the scope level by level.
      </>
    ),
    repo: (href: string) => (
      <>
        The repositories are public:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a> and
        its siblings. The chip crates embed die data derived from
        visual6502-family imagery, so NonCommercial and ShareAlike travel
        with them; the contract crate is MIT and embeds nothing.
      </>
    ),
  },
  ja: {
    kinship: (
      <>
        <Link href="/ja/6502">6502 の仕事</Link>はチップをスイッチのレベルで模擬し、<Link href="/ja/ntsc">ntsc-crt</Link> はコンソールとブラウン管の間の信号を模擬する。このプロジェクトは、その二つが隣人であることをやめて一台の機械になる場所だ: 動く NES をチップごとに組み上げ、チップ間の規約は文書の約束ではなく、記録済みのリファレンストレースで証明する。
      </>
    ),
    contractsH: "チップは一つの規約を共有し、ピンについての嘘はテストで落ちる",
    contracts: (busHref: string, ppuHref: string) => (
      <>
        <a data-address href={busHref}>nes-bus</a> は、すべてのチップクレートが話すフレーム型とピン表を依存ゼロで持つ。これは単なるコンパイル検査ではない: PPU（<a data-address href={ppuHref}>2c02</a>）の記録済みリファレンス走行はいま規約のピンフレームを通して再生され、一本のピンの極性について嘘をつく仕込みの妨害は、再生を失敗させなければならない。
      </>
    ),
    fifthH: "五つ目のチップは、例外リストなしにリファレンスと厳密に一致する",
    fifth: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        <a data-address href={repoHref}>2a03</a> は NES の CPU: 6502 コア、クロック分周器、音源ユニット、合わせて {r.a0.transistors} 個のトランジスタと {r.a0.defined_nodes} 個の定義済みノードで、二つの独立したパーサが同じ数を数えた。記録済みの走行はリファレンスシミュレータに対し {r.a0.golden_states} 状態をビット単位で、例外リストを一切持たずに再生する。一族で最初のチップだ。そこへ至る途中で、エンジンが初版から抱えていた問いも決着した: 2A03 は電源投入時に、レイアウトのプルと外部駆動が争うグループを {r.a0.contested_groups} 個作る（どのチップでも初のゼロでない数）。halfphi {r.halfphi} はそれをシリコンと同じ向きに解決し、他のどのチップでも観測不能であることが証明されている。
      </>
    ),
    soundH: "最初の音。そして音程はプログラムそのもの",
    sound: (r: ReturnType<typeof nes>) => (
      <>
        うちの小さなプログラムがメモリハーネス越しにチップ上で走り、方形波チャネルを歌わせる。同じプログラムをリファレンス自身が走らせた結果は、ハーネスを通して {r.first_sound.golden_states} 状態をビット単位で再生する: コアと音源ユニットとバスの糊を、一つの比較の下で。そして音程は仮定ではなく、こちらで実測した: チャネルの出力はちょうど {r.first_sound.plateau_half_steps} ハーフステップの台地で振れ、{r.first_sound.plateaus_measured} 個を数えた。{r.first_sound.plateau_half_steps} はプログラム自身のタイマーバイト（{r.first_sound.timer_byte}）から直接来る。妨害としてテストハーネスがそのバイトを偽って供給すると、二つの検査が両方落ちる: 再生はバイトが最初にバスを渡る瞬間に、台地の数は偽のバイトが予言する数そのもので。
      </>
    ),
    soundAlt:
      "揃えた二本のトレース: 方形波チャネルの 4 ビット出力コードが 0 と 15 の間を規則的な台地で振れ、同じ走行がミキサーを通って AD1 ピンのレベルになる。",
    soundCaption: (r: ReturnType<typeof nes>) => (
      <>
        実測したトレース: 走行中のチップから CPU ハーフステップごとに読んだ sq0_out と、同じ走行を転記済みミキサーに通した AD1 ピンのレベル（上端は {r.first_sound.ad1_high}）。ミキサー定数は nesdev wiki のもので、まだ自分たちのベンチには載せていない。
      </>
    ),
    cornersH: "PPU の厄介な隅を、専用トレースで留める",
    corners: (r: ReturnType<typeof nes>, ppuHref: string) => (
      <>
        エミュレータの世界で言い争われてきた問いは、スイッチレベルの PPU（<a data-address href={ppuHref}>2c02</a>）上でスクリプト化したレジスタプログラムによって一つずつ答えられた。リファレンスシミュレータは同じスクリプトを何も知らずに走らせ、重要な窓の中で全ノードをダンプする。スプライト 0 はライン {r.c2c02.p2.hit_vpos}、ドット {r.c2c02.p2.hit_hpos} で当たる。スプライト自身の x に 2 ドットのパイプラインを足した位置で、二つのスプライト窓は {r.c2c02.p2.sprite_states} 状態を例外なしにノード単位で再生する。有名な vblank 取りこぼしの窓は約 1.5 ドット幅と測れ、フラグの立ち上がりをまたぐ三回の読み出しはビット 7 を {r.c2c02.p2.race_bits}（取りこぼし、抑止、消費）と返し、リファレンス自身がサンプルしたデータビットと照合済み。OAM はどちらの既知のトリガでも破損を見せなかった。
      </>
    ),
    enginesH: "エンジンの相違が二つ、どちらもチップが見つけ、エンジンで直った",
    engines: (r: ReturnType<typeof nes>) => (
      <>
        スプライト 0 をそもそも当てることが最初の相違を暴いた: グループが両方のレールを含むときにリファレンスが特別扱いする OAM データ線を、エンジンはゼロに潰していた。halfphi 0.1.5 はその修正を汎用のホールドとして持ち、面積で重み付けした電荷投票、つまりリファレンス自身の規則で決める。二つ目はパレット書き込みを実 CPU と同じ間隔で行うまで隠れていた: バイトはうちのエンジンではアドレス下位バイトと OR されて着地し、リファレンスでは書いたとおりに着地した。原因は駆動されていないグループの解決のしかただった。2C02 のリファレンスはメンバーの面積を量り、visual6502 は電荷を持つメンバー一つで勝たせる。halfphi {r.c2c02.halfphi} はネットリストにどちらかを宣言させ、投票を宣言すると PPU の二つの記録済みリファレンス走行は例外を一切持たずに再生する: 電源投入からの {r.c2c02.p0_states} 状態と、バスハーネス越しの {r.c2c02.p1_states} 状態、{r.c2c02.nodes} ノードの一つ残らず。それらの走行が未定義の電源投入状態として隠していた {r.c2c02.masked_latches_p0} 個、次いで {r.c2c02.masked_latches_p1} 個のラッチは、シリコンではなく電荷規則だった。いまは検査が宣言を押さえ、古い規則でチップを組むとその検査が赤になる。
      </>
    ),
    ladderH: "高速 PPU はドット単位でチップと一致し、フレーム周期の内側に収まる",
    ladder: (r: ReturnType<typeof nes>) => (
      <>
        高速 PPU はチップの二つ目のモデルではない。そのシーケンサはビルド時にスイッチレベルのチップから測り出した表で、フレームの各ドットに一語: チップがどのフェッチをラッチしたか、いつアドレスを進めたか、いつスクロールをコピーしたか、いつフラグが立ったか。書き下ろしたのはデータパスだけで、それはチップ自身のフレームに押さえられている: 最初のワールドで {r.c2c02.p3.visible_dots} 個の可視ドットがスイッチレベルの描画と一致し、64 スプライトのワールド（反転、優先度、一行に九つ、スプライト 0 の当たりは ({r.c2c02.p3.hit_line}, {r.c2c02.p3.hit_pixel})、チップ自身のフラグはドット {r.c2c02.p3.chip_hit_hpos} で立った）で {r.c2c02.p3.sprite_dots} 個すべて、そしてフレーム途中に五つのレジスタ書き込みが着地するスクロールワールドで {r.c2c02.p3.scroll_dots} 個すべて。書き込みはそれぞれ自分のバスアクセスの中で効く（アクセス開始から {r.c2c02.p3.write_delay_plateau} ドットの台地）。1 フレームを {r.c2c02.p3.mean_ms} ms で描き、フレーム周期 {r.c2c02.p3.frame_period_ms} ms の {r.c2c02.p3.mean_inside_x} 倍内側、最悪フレーム {r.c2c02.p3.worst_ms} ms、{r.c2c02.p3.frames_timed} フレームで計測。
      </>
    ),
    sequencerAlt:
      "PPU の 1 走査線のタイミング図: ネームテーブル、属性、パターンのフェッチと、アドレス増分、コピー、スプライト評価の行に、スイッチレベルのチップがそれを発火させる各ドットの目盛り。",
    sequencerCaption: (
      <>
        チップ内部のスケジュールを走査線一本ぶん、スイッチそのものから読み取った。各行は高速 PPU の材料になる制御信号で、目盛りは実チップがそれを発火させたドット: 青がフェッチ、赤がアドレスとスプライトのイベント。図解を写したものではなく、実測だ。
      </>
    ),
    worldsAlt1:
      "スイッチレベルの PPU が描いたスプライトワールドを一族の NTSC 経路に通したもの: XOR 模様の背景の上に 64 個のスプライト、模擬ブラウン管上。",
    worldsAlt2:
      "スイッチレベルの PPU が描いたスクロールワールド: スクロールした XOR 模様の背景に、フレーム途中のレジスタ書き込みがスクロールを変えた切れ目が見える。",
    worldsCaption: (
      <>
        高速 PPU が再現しなければならないテスト画像が二つ。スイッチレベルのチップが描き、テレビが映すのと同じように、コンポジットにエンコードして模擬ブラウン管にデコードして示した。わざとノイズのように見せている: どのタイルも自分の位置から計算されるので、一つの間違ったドットにも隠れる場所がない。スクロールワールドを横切る二本の切れ目もわざとで、フレーム途中に書き込まれたスクロールの変更だ。高速 PPU はどちらの絵もドット単位で正しく描く。
      </>
    ),
    pinsH: "6502 のピンに現れた 2A03 のコア、チップ対チップ",
    pins: (r: ReturnType<typeof nes>) => (
      <>
        コンソールのスケッチが言う新種の検査、規約を介したチップ対チップの比較は、両半分がそろった。2A03 の 6502 コアを 6502 プロジェクト自身の規約クレートのピンフレームとしてクロック位相ごとに提示し、6502 の記録済みピン走行の全トレース（{r.n3.golden_traces} 本: 七つのプログラム、リファレンスのプログラム、割り込みと RDY のスクリプト走行、三本の 10 進モード連鎖、全 256 命令）を通す。相手のチップは記録されたテキストとして入り、エンジンとしては決して入らない。{r.n3.traces_compared} 本が比較され（{r.n3.traces_refused} 本は 2A03 にないピンを駆動するので名指しで拒む）、うち {r.n3.traces_exact} 本は全ハーフサイクルの全フィールドで一致。残りは名前と境界を持つ四つのクラスの内側でだけ異なる: スタックページ（二つのダイの模擬電源投入スタックポインタは ${r.n3.stack_offset_hex} 違い、両コア自身のレジスタから導いた）、書き込みの phi1 半分のデータバイト（そこでは何も供給されない）、10 進連鎖（6502 が補正するところを 2A03 は二進の和と二進のフラグを書く、{r.n3.decimal_stores} バイトを算術と共に列挙）、そして走行中のリセット（2A03 は RES の間コアを止め、6502 は走り続け、どちらも同じハーフサイクルでベクタを読む）。この一覧が 2A03 自身の高速コアの形を決めた: 10 進補正を切り離し、スタックポインタをこのチップから種付けした 6502 の高速コア。二つのつまみは 6502 リポジトリに着地し、そこの記録済み走行に押さえられている。スイッチレベルの 2A03 に対して全プログラムと全スクリプトで: {r.n3.core_programs} プログラム、{r.n3.core_half_cycles} ハーフサイクル、残る差は write-phi1 のバイトだけ。
      </>
    ),
    apuH: "表としての APU、ハーフステップごとにチップに押さえる",
    apu: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        音の側は PPU の型に従う: ビルド時にスイッチレベルのチップから測り出した表、ヘッドレスなプローブから書き下ろした周りの機構、そして全体をチップ自身の出力に押さえる。先にプローブ、計測器として残した十一の実測（両モードのフレームシーケンサ、長さ表、デューティ列、エンベロープとスイープのクロック、三角波、ノイズと DMC の周期表、スプライト DMA、コントローラのストローブ）が、公開モデルの言わないことを二つ見つけた。ノイズと DMC のタイマはカウンタではなく線形帰還シフトレジスタで、電源投入から自走し、終端に達すると記録済み十六状態の一つを再装填する: ダイの周期 ROM で、ノイズ ROM のインデックス 12 は公開表がすべて {r.n3.noise_index12_published} と言うところで {r.n3.noise_index12_die} サイクルに落ちる。ダイデータの転記欠陥か部品の癖か、名指しして持ち越す。ユニット内部のタイミングはすべて、検査の符号列が最初に分かれた時にプローブで測って留めた定数だ: 下位バイトの周期書き込みは次のティックを再装填にし、方形波の符号はステップから 2 ハーフステップ遅れ、DMC の出力ユニットは電源投入から八回の完了を数えてから鳴る。検査は両フレームモード下の二つのレジスタプログラム、{r.n3.apu_worlds} ワールド各 {r.n3.apu_half_steps} ハーフステップで、五つの出力符号とフレーム IRQ フラグが全ハーフステップでスイッチレベルのチップと同一。次にストール: ピンに現れたチップ全体、DMA ユニットがバスを取る様子を、RDY も他のフィールド同様に比べながらフレーム単位でスイッチレベルのチップと照らす。両方の書き込み整列でのスプライト DMA（各 {r.n3.dma_frames} フレーム、RDY 低は {r.n3.dma_rdy_low_even} と {r.n3.dma_rdy_low_odd}）と DMC のサンプル取り込み（{r.n3.dmc_frames} フレーム、RDY 低は {r.n3.dmc_rdy_low}）。すべてを付けたチップは毎秒 {r.n3.half_cycles_per_s} ハーフサイクル、実時間の {r.n3.real_time_x} 倍で走る。段階ごとの記録は<a href={`${repoHref}/blob/main/docs/n3-report.md`}>N3 報告</a>。
      </>
    ),
    apuAlt: "2A03 時間 22 ミリ秒にわたる五段のトレース: 二つの方形波、三角波、ノイズ、DMC の出力符号とフレーム IRQ の印",
    apuCaption: (r: ReturnType<typeof nes>) => (
      <>
        検査の長音ワールド {r.n3.apu_half_steps} ハーフステップにわたる五つの出力符号: 書き下ろした APU の列で、検査はそのすべてでスイッチレベルのチップと同一だと押さえた。方形波 1 はミュートまでスイープし、方形波 0 のエンベロープは最初の四分フレームで始まり、ノイズの LFSR はタイマの電源投入周回を待ち、DMC は 33 バイトのサンプルを歩く。縦線はフレーム IRQ。
      </>
    ),
    mApuHalfSteps: (n: number, w: number) => <>APU 検査: <b>{w} ワールド、各 {n} ハーフステップ同一</b></>,
    mStalls: (n: number) => <>ストール検査: <b>{n} フレーム同一、RDY 込み</b></>,
    mRealTime: (x: string) => <>APU 込みで: <b>実時間の {x} 倍</b></>,
    consoleH: "二つのチップが一つのクロックに乗り、実 CPU を付けて標準テスト ROM が走る",
    console: (r: ReturnType<typeof nes>) => (
      <>
        まず糊。NES-001 基板の少数の部品、アドレスデコーダ、PPU のアドレスラッチ、二つの RAM、コントローラポートのバッファとその先のコントローラ、リセット連鎖を、それぞれ数行で自前の検査によりデータシートに押さえ、書き下ろしと札を付けた。そこにはネットリストを通るものがないからだ。二つは最初の書き下ろしが間違っていて、検査がそう言った。次にコンソール: 2A03 の高速コアと高速 PPU を一つのマスタハーフステップ計数器に乗せ、CPU は十二ごと、PPU は八ごとに進み、位相は二つのスイッチレベルチップ自身のクロック分周器から測った（cpu_phase {r.console.alignment.cpu_phase}、ppu_phase {r.console.alignment.ppu_phase}。分周器が電源投入で取り得る {r.console.gate1.alignments} 通りの一つで、走行がスタンプに記す）。配管の検査はテストカートリッジを {r.console.plumbing.frames} フレーム走らせ、マスタ計数器がドットあたり八であること、奇数フレームが一ドット短いこと、絵が単体 PPU のものと同じこと、RAM の NMI 計数が一フレーム一回であることを押さえる。一コアで毎秒 {r.console.frames_per_s[0]} から {r.console.frames_per_s[1]} フレーム、実時間の {r.console.real_time_x[0]} から {r.console.real_time_x[1]} 倍。位相の検査は、この弧全体の要である継ぎ目を二通りに押さえる。PPU の実 NMI を BRK の周りに一サイクル刻みで {r.console.gate1.nmi_offsets} 通りの位置に落とし、コンソールの CPU を同じエッジで駆動したスイッチレベルの 6502 とハーフサイクルごとに比べる: {r.console.gate1.nmi_half_cycles} ハーフサイクルが一致、取ったベクタも、プッシュも、タイミングも。そして $2002 読み出しの競合をコンソール自身のアクセス形でスイッチレベル PPU 上に全ハーフステップで測り、コンソールの読み出しをその表に {r.console.gate1.alignments} 通りすべての位相で押さえる: フラグのセット周りで {r.console.gate1.race_reads_set} 回、クリア周りで {r.console.gate1.race_reads_clear} 回、両窓の全ハーフステップに届き、結果はすべてチップのもの。
        そして、この弧全体が目指してきた、本物のプログラムでの検査: blargg のテスト ROM をコンソール全体に通す。これらの高速チップが何百万サイクルも実プログラムを走らせた最初の機会だ。CPU タイミング検査は合格。命令検査は {r.console.blargg.instr_total} 本中 {r.console.blargg.instr_pass} 本が合格、公式・非公式の全命令。スプライトヒット検査は {r.console.blargg.sprite_total} 本中 {r.console.blargg.sprite_pass} 本が合格{r.console.blargg.sprite_pass === r.console.blargg.sprite_total ? "。縦長の一本は、高速 PPU の縦長スプライト規則をスイッチレベルチップで測ってドット単位で押さえてからの合格だ" : "、残る一本は名指しで拒む（縦長スプライトは模していない）"}。vblank と NMI のタイミング検査は {r.console.blargg.vbl_nmi_total} 本中 {r.console.blargg.vbl_nmi_pass} 本が合格、残りは文書化された実機から一、二ドットのずれで、すべて一つの問いに帰する: 実機の NMI は、それぞれ自身の実測タイミングに押さえた二つのチップが許すより約二ドット遅れて CPU に届く。決めるのは実基板に当てるスコープだ。APU 検査は {r.console.blargg.apu_total} 本中 {r.console.blargg.apu_pass} 本が合格。うち六本は、不合格をスイッチレベルの 2A03 で測って書き下ろしてからの合格だ: $4017 書き込みの位相ジッタと即時クロック、バスに尋ねた半ステップ後にラッチされるステータス、三サイクル続けて立つ IRQ フラグ、読み出しが着地する所で数え落とされる DMC のバイト。ROM が見つけたものこそ走らせる意味だ: 高速 CPU は記録済みの全トレースを正確に再生しながら、トレースが覆っていなかった五つの見落としを抱えていた（駆動されないバス線に乗って次の命令へ渡る桁上げ、誤った捕捉から読んだシフトの桁上げ、結果がバスの取り合いでありスイッチモデルが独自に決着させる三命令、割り込み入力を標本化するハーフサイクル（位相の検査が捕まえた）、そしてバスに尋ねるより遅くラッチされるバイト）。高速 PPU にも四つ。それぞれ、スイッチレベルチップと高速チップを ROM 上で食い違うまで並走させて位置を特定し、チップで測り、書き下ろし、無ければ赤になる固定具で押さえた。記録は<a href={`${r.console.repo}/blob/main/docs/n5-report.md`}>N5 報告</a>。遊びの検査はカートリッジ待ち。
      </>
    ),
    pictureH: "コンソールのフレームがテレビ模型を通り、その捕捉が採点される",
    picture: (r: ReturnType<typeof nes>) => {
      const p = r.console.picture;
      const c = p.capture;
      const rowKeys = ["1", "2", "3", "0"] as const;
      const rowsJa = rowKeys.map((k, i) => {
        const row = c.rows[k];
        return (
          <span key={k}>
            輝度行 {k}: {row.regions} 領域中 {row.within_all} が三つとも成立（最悪で輝度 {row.worst_luma}、色相 {row.worst_hue_deg} 度、彩度 {row.worst_sat}、レートは {row.recovered_ppm} ppm）
            {i < rowKeys.length - 1 ? "。" : "。"}
          </span>
        );
      });
      return (
        <>
          絵は ntsc-crt の連鎖（{p.ntsc_crt}、タグで固定）で、コンソールが足すのは二つだけ: フレームの順序と、一つのフレームから次へ持ち越す副搬送波の位相だ。奇数フレームの短い一行が位相を動かすので、コンソールはドットだけでなくパリティを渡す。各フレームは NES ソースで符号化され、三ラインコムで復号され、書き下ろしの定数で CRT の各段を通る。押さえは二つ。コンソールのフレームをこの連鎖に通したものは、同じ世界から単体の高速 PPU が出したフレームを同じ連鎖に通したものと、復号された全標本で一致する（{p.components_equal} 成分が一致、{p.parity} フレーム、画面上 {p.displayed[0]} × {p.displayed[1]}）。そして {p.phase_frames} フレーム（うち {p.phase_short} が短い）後の位相は、その列にグリッドの算術が与えるもの（位相 {p.phase}。全フレームを偶数に強制すると違う値になり、検査が赤になる）。実機比較が欲しがるカラーバーのカートリッジは PPU の描画を切って塗るが、高速 PPU はそれを訊かれたことがなかった: スイッチレベルのチップで測ると、描画を切った絵はアドレスレジスタが指すパレット項目で、行途中の書き込みに対するタイミングは今そこに固定具として在る。
          次に捕捉経路、実機が加わる比較の機械側半分: カラーバーのカートリッジをコンソールに通し、そのフレームを ntsc-crt の捕捉カード模型に通して実記録とまったく同じ手順で復元し、合成は模型自身のフロントエンドを通して両側が同じ帯域制限を持つようにし、平坦な領域すべてを同一の復号器を通したその合成に対して、縁から {c.margin_dots} ドット内側で採点する。この距離は選んだのではなく復号器のクロマフィルタから導いた。許容は走らせる前に書いた: 輝度 {c.tol_luma} 以内、色相 {c.tol_hue_deg} 度以内、彩度 {c.tol_sat_pct} パーセント以内。カートリッジはリポジトリ自身のもの。blargg のバーは十六ドット幅で復号器は五ドットで落ち着くからだ: 三十二ドットのセルに十二の色相を一つの輝度行で並べ、背景色を加え、行は二秒ごとに進み、行ごとに一走行で採点する。{rowsJa}{c.held ? "往復は閉じる。" : "往復は閉じない。"}最初の走行群は採点自身の幾何の前に計器を三度見つけた: ヒストグラム一区画分粗いレベル基準合わせ、消去期間と取り違えられた暗い絵、同期エッジと取り違えられた最も暗い色のクロマの谷。それぞれ ntsc-crt 側で直して固定し直した。同じカートリッジの実機記録がベンチ項目で、そのためのカートリッジはいま在る。記録は<a href={`${r.console.repo}/blob/main/docs/n6-report.md`}>N6 報告</a>。
        </>
      );
    },
    consoleSoundH: "コンソールの音が基板の音声段を通り、blargg のミキサー検査に押さえられ、彼の録音と並ぶ",
    consoleSound: (r: ReturnType<typeof nes>) => {
      const s = r.console.sound;
      const roms = ["square", "triangle", "noise", "dmc"] as const;
      return (
        <>
          2A03 の五つの出力コードは CPU ハーフサイクルごとにチップを出て、二つの DAC を通る。一族が初音以来抱えてきた nesdev の表で、書き下ろしと札が付く。その先は NES-001 の回路図にあり、直接読んだ: 各音声ピンは 100 オームで引き下げられ（表自身の「プラス 100」）、二つのピンは 20K と 12K で加算され（表の二つの定数がすでに抱える比）、結合コンデンサを経て、47K の帰還抵抗と並列の 220 pF で線形に保たれた 74HC04 インバータに入る。つまりジャックまでは、時定数 {s.stage.tau_hp_ms} ms のハイパス、インバータの符号付きの利得 {s.stage.gain}、{s.stage.tau_lp_us} マイクロ秒のローパス、そして厳密な有理時刻での窓付き sinc による 48 kHz への再標本化。段はその算術に押さえられる（ステップは時定数ごとに {s.stage.step_ratio} に減衰し、10 kHz の音は 200 Hz に対して {s.stage.tone_ratio} で通り、値が与えるのは {s.stage.tone_expected}）。模していないと明記するもの: インバータの有限な開ループ利得とその電源レール、そして表の絶対電圧。後者はスコープ記録が与える一つの倍率だ。
          実機に対する検査は blargg のもの: 四つのミキサー ROM で、それぞれ一チャンネルを鳴らしながら DMC がその逆波形を鳴らすので、正しいミキサーは二つの参照ビープの間でほぼ無音に打ち消す。それぞれをコンソール全体に通し、各検査の最悪の 100 ms 窓はビープに対する割合で {s.tolerance_pct} パーセント未満でなければならない（DMC の一段だけで約二）。ノイズ ROM は設計上ノイズがフェードするので純音成分で押さえる。コンソール、次いで同じ ROM を実機で録った blargg の録音を同じコードで測ったもの: {roms.map((k, i) => (
            <span key={k}>
              {k} は {s.roms[k].rms_pct} パーセント対 {s.roms[k].rec_rms_pct}
              {i < roms.length - 1 ? "、" : "。"}
            </span>
          ))}
          三角波とノイズは実機とコンマ数パーセントで一致する。矩形波と dmc は実機でコンソールの二倍の残差を抱え、その残差は純音だ: 実物のパルス DAC と DMC DAC は、表が blargg の逆波形から離れる以上に表の曲線から離れている。これはスコープへの問いで、記録し、押さえない。代わりに wiki の線形近似で混ぜると検査は赤になり、ビープの三分の一に達する。記録は<a href={`${r.console.repo}/blob/main/docs/n7-report.md`}>N7 報告</a>。AUDIO_OUT の記録がベンチ項目。
        </>
      );
    },
    shellH: "窓の中のコンソール。絵は GPU に置かれて CPU の連鎖に押さえられ、二つ目の標的はブラウザ",
    shell: (r: ReturnType<typeof nes>) => {
      const s = r.console.shell;
      const g = s.gpu.authored;
      const m = s.gpu.mask_and_geometry_on;
      const p = s.pacing;
      const w = s.wasm;
      return (
        <>
          一フレームが一コアで要する時間は何かを書く前に測られ、仕事がどこへ行くべきかを告げた: コンソールと符号化器は一コアに収まり、コム復号と五段の CRT は CPU のどこにも収まらない。その二つはいま GPU 上の八つの計算パスで、すべての定数は打ち込まれるのではなく復号器と CRT のパラメータから送られ、連続する三フレーム（最後は残光が見えるよう黒）の全画素の全成分で信号経路自身の CPU 連鎖に押さえられる。書き下ろしのパラメータでは最悪の成分差が {g.worst.toExponential(1)}、平均が {g.mean.toExponential(1)}。マスクと幾何を入れると {m.worst.toExponential(1)} と {m.mean.toExponential(1)}。先に述べた許容は {s.gpu_tolerance.worst} と {s.gpu_tolerance.mean}。一フレームは {g.adapter} で転送込み {g.ms_per_frame} ms。残光を飛ばすと検査が赤になる。
          窓は Linux のバイナリ: 音付きのコンソールが自分のスレッドで、信号経路のドリフト方針が壁時計から決める分だけ周期ごとにフレーム単位で進み、重複と欠落を数え、時間方向には決して再標本化しない。表示は新しいフレームごとに符号化して GPU の絵を走らせ、音は音声デバイスへ、キーボードはコントローラ 1。ループは合成クロックで押さえる: ちょうど周期では {p.at_period.ticks} 拍で新フレーム {p.at_period.new}、重複 {p.at_period.duplicated}、欠落 {p.at_period.dropped}。半周期では {p.at_half.ticks} 拍のうち {p.at_half.duplicated} が前のフレームを再提示。二倍では {p.at_twice.ticks} 拍で {p.at_twice.dropped} 欠落。この機械では仮想ディスプレイで走った。本物の画面、スピーカー、手が机の項目。
          二つ目の標的はブラウザ: 音付きのコンソールを wasm-bindgen の後ろに置き、node で {w.rom} を測った: {w.frames} フレームを {w.seconds} 秒、毎秒 {w.frames_per_s} フレーム、実時間の {w.real_time_x} 倍、一フレームあたり {w.sound_per_frame} 音声標本。その標的はいまページを持つ: <Link href="/ja/nes/play">コンソールはここで走る</Link>。自分のディスクのカートリッジで、ntsc ベンチと同じ信号経路を通り、ドリフトカウンタを生で表示する。記録は<a href={`${r.console.repo}/blob/main/docs/n8-report.md`}>N8 報告</a>。
        </>
      );
    },
    mConsoleTests: (n: number) => <>nes スイート: <b>{n} テスト緑</b></>,
    mConsoleInstr: (p: number, t: number) => <>命令検査: <b>{t} 本中 {p} 本合格</b></>,
    mConsoleRate: (lo: string, hi: string) => <>コンソール: <b>実時間の {lo} から {hi} 倍</b></>,
    mConsoleCommit: (commit: string, href: string) => (
      <>nes コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "ベンチ: 実機と模型を同じ入力履歴の下に置く",
    bench: (r: ReturnType<typeof nes>) => (
      <>
        機械側のマイルストーンがすべて閉じたいま、コンソールがまだ実機について知らないことはベンチを待っており、次に組むのはそのベンチだ。コンソールのコントローラポートと純正パッドの間にブリッジを置く: ブリッジ上のシフトレジスタがコンソールにクロックされるパッドそのものになり、マイクロコントローラはポーリングの合間にその入力を書き、コンソールのラッチとクロックのパルスをハードウェアで数え、LAN 上の Raspberry Pi がスクリプトを受け取り、リセットと電源のリレーを駆動し、スコープをトリガする。スクリプトはラッチ番号ごとのバイトなので、模型と実機は同じ履歴を見る。ブリッジのラッチごとのログと模型のログをラッチ単位で突き合わせ、トリガした取り込みは絵のマイルストーンが閉じたのと同じ往復で採点する。計画はファームウェアより先に四つのマイルストーンと検査を名指しし、最初の「盗み聞き」はすでに模型を動かした: DMC フェッチがパッド読み出しに何をするか問うと、スイッチレベルの 2A03 が実機より先に答え、コアと高速チップとコンソールがそれに合わせて変わり、それぞれの変更は、無ければ赤になる妨害テストが押さえる。いまや各マイルストーンの道具はハードウェアに先んじて揃っている: スクリプトをブリッジとリレーとスコープに流すヘッドから、実機と模型が食い違う最初のポーリングを見つける二分探索まで、それぞれ代役に対して検証され、無ければ赤になる妨害テストが押さえる。下の図は配線表からスクリプトが導いたもので、表と食い違うことはできない。計画、配線、スクリプト、進行中の報告は<Link href="/ja/docs/nes">ノートブック</Link>に、リポジトリは <a data-address href={r.family.bench}>{r.family.bench.replace("https://", "")}</a>。
      </>
    ),
    benchAlt: "ベンチの一枚の図: 上にループ（ワークステーション、Pi、ブリッジ、コンソール、パッド、スコープ、リレー）、下にブリッジのチップと全ピン。",
    benchCaption: "配線表から導いたベンチの図: ループと、全ピン付きのブリッジ。まだ何も組まれていない。",
    sheetAlt: "回路図としてのブリッジ v1: コントローラポート、コンソールの 5 V 側のインバータとシフトレジスタ、3.3 V 側のレベルシフタと ESP32-C6、パッドソケット、そしてリレーとスコープを持つヘッド。",
    sheetCaption: "同じブリッジを回路図に: ベンチの電子回路レビューから。ネットラベル、三つの電源、一つのグラウンド、検査で配線表に押さえられている。組み立て順と拡張ブリッジはノートブックに。",
    timingAlt: "コントローラの一回のポーリングをタイミングレーンに: ラッチパルスとレジスタのロード窓、八つのクロックパルス、データ線、各ハードウェアカウンタが数えるもの、マイクロコントローラのループ、書き込みが安全な場所。",
    timingCaption: "実機での一回のポーリングをタイミングレーンに: レジスタの入力を変えてはならないロード窓、二つのカウンタが数えるもの、ブリッジが書いてよい場所。すべての幅はスコープが置き換えるまで著述値。",
    boardedH: "ここの数字は、テストを走らせ直した実測から来ている",
    boardedIntro: (date: string) => (
      <>
        下の数字は {date} に、記録されたコミットで二つのチップリポジトリ自身のスイート（ネットリストと記録済みのリファレンス走行をすべて必須にして）と MUTATE=1 をもう一度走らせて得たもので、このページはその走行が書いたものだけを読む。
      </>
    ),
    mTests: (n: number) => <>スイート: <b>{n} テスト緑</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} テスト赤</b></>,
    mHalfphi: (v: string) => <>halfphi: <b>{v}</b></>,
    mCommit: (commit: string, href: string) => (
      <>コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    mPpuTests: (n: number) => <>2c02 スイート: <b>{n} テスト緑</b></>,
    mPpuReds: (n: number) => <>2c02 MUTATE=1: <b>{n} テスト赤</b></>,
    mPpuCommit: (commit: string, href: string) => (
      <>2c02 コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    aheadH: "スケッチが求めたもの、そして実機を待つもの",
    ahead: (sketchHref: string) => (
      <>
        計画は先に書かれた: 規約リポジトリの<a href={sketchHref}>エンドツーエンドのスケッチ</a>に、マイルストーンごとの検査がある。そこに名のあるマイルストーンはすべてこの機械の上で組まれ、検査を通っている: 規約、スイッチレベルの二つのチップとそこから組んだ高速チップ、丸ごと組み上がった高速 2A03、糊、一つのクロックで標準スイートを走らせるコンソール、エンコーダを通って取り込み経路を戻る絵、基板自身の段を通る音、そして GPU の絵とゲームパッドとブラウザ標的を持つシェル。残るのは、スイッチレベルの模型だけでは決められないものそのものであり、各項目は報告に名指しされている: 実基板での NMI 到達タイミング、遊びの検査に入れる実カートリッジ、絵のマイルストーンが求めた終端付きの取り込み、実スピーカーの下での音の段、コンソールが電源投入時に取る位相、そして模型と実機が食い違うと分かっていてロジックアナライザが決めるダイ自身の発見。上のベンチはそれらを閉じる手段だ。信号の側はすでに実在する: <Link href="/ja/ntsc">ntsc のページ</Link>には実機からデコードしたフレームが載り、<Link href="/ja/ntsc/composite">コンポジット深掘り</Link>はその実機の映像をスコープからレベルごとに読む。
      </>
    ),
    repo: (href: string) => (
      <>
        リポジトリは公開されている:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a> とその兄弟たち。チップクレートは visual6502 系の画像に由来するダイデータを埋め込むため、NonCommercial と ShareAlike が付いて回る。規約クレートは MIT で、何も埋め込まない。
      </>
    ),
  },
} as const;

export default async function NesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("nes");
  const r = nes();
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;

  return (
    <Shell lang={lang} die="NES" title={p.name}>
      <div className="prose">
        <p>{t(lang, p.what)}</p>

        <p>{S.kinship}</p>

        <h2>{S.contractsH}</h2>
        <p>{S.contracts(r.family.nes_bus, r.family.c2c02)}</p>

        <h2>{S.fifthH}</h2>
        <p>{S.fifth(r, r.repo)}</p>

        <h2>{S.soundH}</h2>
        <p>{S.sound(r)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/first-sound.png"
            width={1760}
            height={864}
            alt={S.soundAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.soundCaption(r)}</figcaption>
        </figure>

        <h2>{S.cornersH}</h2>
        <p>{S.corners(r, r.family.c2c02)}</p>

        <h2>{S.enginesH}</h2>
        <p>{S.engines(r)}</p>

        <h2>{S.ladderH}</h2>
        <p>{S.ladder(r)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/ppu-sequencer.png"
            width={2100}
            height={630}
            alt={S.sequencerAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.sequencerCaption}</figcaption>
        </figure>

        <figure className="crt-figure">
          <Image src="/nes/ppu-sprite-world.png" width={768} height={720} alt={S.worldsAlt1} unoptimized />
          <Image src="/nes/ppu-scroll-world.png" width={768} height={720} alt={S.worldsAlt2} unoptimized />
          <figcaption>{S.worldsCaption}</figcaption>
        </figure>

        <h2>{S.pinsH}</h2>
        <p>{S.pins(r)}</p>

        <h2>{S.apuH}</h2>
        <p>{S.apu(r, r.repo)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/apu-codes.png"
            width={1210}
            height={935}
            alt={S.apuAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.apuCaption(r)}</figcaption>
        </figure>

        <h2>{S.consoleH}</h2>
        <p>{S.console(r)}</p>

        <h2>{S.pictureH}</h2>
        <p>{S.picture(r)}</p>

        <h2>{S.consoleSoundH}</h2>
        <p>{S.consoleSound(r)}</p>

        <h2>{S.shellH}</h2>
        <p>{S.shell(r)}</p>

        <h2>{S.benchH}</h2>
        <p>{S.bench(r)}</p>
        <figure className="crt-figure">
          <Image src="/nes/bench.svg" width={1200} height={1000} alt={S.benchAlt} unoptimized />
          <figcaption>{S.benchCaption}</figcaption>
        </figure>
        <figure className="crt-figure">
          <Image src="/nes/bench/bench-v1.svg" width={2000} height={1180} alt={S.sheetAlt} unoptimized />
          <figcaption>{S.sheetCaption}</figcaption>
        </figure>
        <figure className="crt-figure">
          <Image src="/nes/bench/logical-timing.svg" width={1500} height={900} alt={S.timingAlt} unoptimized />
          <figcaption>{S.timingCaption}</figcaption>
        </figure>

        <h2>{S.boardedH}</h2>
        <p>{S.boardedIntro(r.boarded_on)}</p>
        <div className="boarded" data-boarded>
          <span className="measured">{S.mTests(r.tests_green)}</span>
          <span className="measured">{S.mReds(r.mutate_red)}</span>
          <span className="measured">{S.mHalfphi(r.halfphi)}</span>
          <span className="measured">{S.mCommit(commitShort, commitHref)}</span>
        </div>
        <div className="boarded" data-boarded-ppu>
          <span className="measured">{S.mPpuTests(r.c2c02.tests_green)}</span>
          <span className="measured">{S.mPpuReds(r.c2c02.mutate_red)}</span>
          <span className="measured">{S.mPpuCommit(r.c2c02.commit.slice(0, 7), `${r.c2c02.repo}/commit/${r.c2c02.commit}`)}</span>
        </div>
        <div className="boarded" data-boarded-n3>
          <span className="measured">{S.mApuHalfSteps(r.n3.apu_half_steps, r.n3.apu_worlds)}</span>
          <span className="measured">{S.mStalls(2 * r.n3.dma_frames + r.n3.dmc_frames)}</span>
          <span className="measured">{S.mRealTime(r.n3.real_time_x)}</span>
        </div>
        <div className="boarded" data-boarded-console>
          <span className="measured">{S.mConsoleTests(r.console.tests_green)}</span>
          <span className="measured">{S.mConsoleInstr(r.console.blargg.instr_pass, r.console.blargg.instr_total)}</span>
          <span className="measured">{S.mConsoleRate(r.console.real_time_x[0], r.console.real_time_x[1])}</span>
          <span className="measured">{S.mConsoleCommit(r.console.commit.slice(0, 7), `${r.console.repo}/commit/${r.console.commit}`)}</span>
        </div>

        <h2>{S.aheadH}</h2>
        <p>{S.ahead(r.family.sketch)}</p>

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
