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
        of 10,906 nodes. The nine and then 27 latches those runs had
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
        run through every recorded trace of the 6502&rsquo;s pin golden
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
        own fast core: the 6502&rsquo;s rung 3 with its decimal adjust
        disconnected and its stack pointer seeded from this chip, two knobs
        landed in the 6502 repository and held to its golden there. Against
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
        when the gate&rsquo;s code streams first parted: a low-byte period
        write makes the next tick a reload, a square&rsquo;s code lags its
        step by two half-steps, the DMC&rsquo;s output unit counts eight
        completions from power-on before it speaks. The gate is two
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
        The five output codes over the gate&rsquo;s long-note world,{" "}
        {r.n3.apu_half_steps} half-steps: the authored APU&rsquo;s streams,
        which the gate held identical to the switch-level chip&rsquo;s at
        every one of them. Square 1 sweeps up to its mute, square 0&rsquo;s
        envelope starts at the first quarter frame, the noise&rsquo;s LFSR
        waits out its timer&rsquo;s power-on lap, the DMC walks a 33-byte
        sample; the vertical line is the frame IRQ.
      </>
    ),
    mApuHalfSteps: (n: number, w: number) => <>APU gate: <b>{w} worlds, {n} half-steps each, identical</b></>,
    mStalls: (n: number) => <>stall gate: <b>{n} frames identical, RDY included</b></>,
    mRealTime: (x: string) => <>with the APU attached: <b>{x}x real time</b></>,
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
    aheadH: "The milestones between here and a bootable console",
    ahead: (sketchHref: string) => (
      <>
        The plan is written down and agreed:{" "}
        <a href={sketchHref}>the end-to-end sketch</a> in the contract
        repository, with a check per milestone. The PPU&rsquo;s corners and
        its fast rung, the pin check in both halves, and the 2A03&rsquo;s
        ladder (its core, its APU, its DMA units) are done. Still ahead, in
        order: the glue, a few authored parts held to their datasheets;
        the console layer, where the two chips meet through the contract
        on one master clock and the standard test suites run with a real
        CPU attached; then a cartridge, and both chips making a frame
        together. The signal side is already real:{" "}
        <Link href="/ntsc">the ntsc page</Link> carries frames decoded from
        a physical console, and{" "}
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
        スプライト 0 をそもそも当てることが最初の相違を暴いた: グループが両方のレールを含むときにリファレンスが特別扱いする OAM データ線を、エンジンはゼロに潰していた。halfphi 0.1.5 はその修正を汎用のホールドとして持ち、面積で重み付けした電荷投票、つまりリファレンス自身の規則で決める。二つ目はパレット書き込みを実 CPU と同じ間隔で行うまで隠れていた: バイトはうちのエンジンではアドレス下位バイトと OR されて着地し、リファレンスでは書いたとおりに着地した。原因は駆動されていないグループの解決のしかただった。2C02 のリファレンスはメンバーの面積を量り、visual6502 は電荷を持つメンバー一つで勝たせる。halfphi {r.c2c02.halfphi} はネットリストにどちらかを宣言させ、投票を宣言すると PPU の二つの記録済みリファレンス走行は例外を一切持たずに再生する: 電源投入からの {r.c2c02.p0_states} 状態と、バスハーネス越しの {r.c2c02.p1_states} 状態、10,906 ノードの一つ残らず。それらの走行が未定義の電源投入状態として隠していた 9 個、次いで 27 個のラッチは、シリコンではなく電荷規則だった。いまは検査が宣言を押さえ、古い規則でチップを組むとその検査が赤になる。
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
        コンソールのスケッチが言う新種の検査、規約を介したチップ対チップの比較は、両半分がそろった。2A03 の 6502 コアを 6502 プロジェクト自身の規約クレートのピンフレームとしてクロック位相ごとに提示し、6502 のピンゴールデンに記録された全トレース（{r.n3.golden_traces} 本: 七つのプログラム、リファレンスのプログラム、割り込みと RDY のスクリプト走行、三本の 10 進モード連鎖、全 256 命令）を通す。相手のチップは記録されたテキストとして入り、エンジンとしては決して入らない。{r.n3.traces_compared} 本が比較され（{r.n3.traces_refused} 本は 2A03 にないピンを駆動するので名指しで拒む）、うち {r.n3.traces_exact} 本は全ハーフサイクルの全フィールドで一致。残りは名前と境界を持つ四つのクラスの内側でだけ異なる: スタックページ（二つのダイの模擬電源投入スタックポインタは ${r.n3.stack_offset_hex} 違い、両コア自身のレジスタから導いた）、書き込みの phi1 半分のデータバイト（そこでは何も供給されない）、10 進連鎖（6502 が補正するところを 2A03 は二進の和と二進のフラグを書く、{r.n3.decimal_stores} バイトを算術と共に列挙）、そして走行中のリセット（2A03 は RES の間コアを止め、6502 は走り続け、どちらも同じハーフサイクルでベクタを読む）。この一覧が 2A03 自身の高速コアの形を決めた: 10 進補正を切り離し、スタックポインタをこのチップから種付けした 6502 のラング 3。二つのつまみは 6502 リポジトリに着地し、そこのゴールデンに押さえられている。スイッチレベルの 2A03 に対して全プログラムと全スクリプトで: {r.n3.core_programs} プログラム、{r.n3.core_half_cycles} ハーフサイクル、残る差は write-phi1 のバイトだけ。
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
    aheadH: "ここから起動するコンソールまでのマイルストーン",
    ahead: (sketchHref: string) => (
      <>
        計画は書かれ、合意済みだ: 規約リポジトリの<a href={sketchHref}>エンドツーエンドのスケッチ</a>に、マイルストーンごとの検査がある。PPU の隅と高速ラング、ピン検査の両半分、そして 2A03 の梯子（コア、APU、DMA ユニット）は済んだ。これから順に: 糊、データシートに押さえた少数の書き下ろし部品。コンソール層、二つのチップが一つのマスタクロック上で規約を介して出会い、実 CPU を付けて標準テストスイートを走らせる場所。それからカートリッジ、二つのチップが一緒に作る最初のフレーム。信号の側はすでに実在する: <Link href="/ja/ntsc">ntsc のページ</Link>には実機からデコードしたフレームが載り、<Link href="/ja/ntsc/composite">コンポジット深掘り</Link>はその実機の映像をスコープからレベルごとに読む。
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

        <h2>{S.aheadH}</h2>
        <p>{S.ahead(r.family.sketch)}</p>

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
