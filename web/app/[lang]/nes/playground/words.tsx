import type { ReactNode } from "react";
import type { Lang } from "@/lib/lang";

/**
 * The playground's own prose, both languages in one place, the way
 * /nes keeps its section's (../prose.tsx): the Japanese edition sits
 * beside the English it translates, so the two move together.
 *
 * What is NOT here: the engineers' own words. Every passage this page
 * quotes from their reports is read from their documents at build time
 * and shown as they wrote it, in their language, exactly as the pulled
 * documents elsewhere on the site are. The page says whose words are
 * whose; it does not translate a record.
 */

export interface StationWords {
  eyebrow: string;
  title: string;
  body: ReactNode;
  record: { href: string; label: string }[];
}

export type StationKey =
  | "tour"
  | "wire"
  | "colours"
  | "mario"
  | "pad"
  | "difference"
  | "xray"
  | "sound"
  | "slow"
  | "die"
  | "program"
  | "bench"
  | "patterns"
  | "real"
  | "museum"
  | "arc";

export interface Hero {
  kicker: string;
  title: string;
  lead: (ms: string) => ReactNode;
  /** What the tab and a link to the page say, which is not the heading. */
  description: string;
}

export interface Machine {
  eyebrow: string;
  title: string;
  intro: string;
  caption: string;
  diagram: string;
  parts: Record<string, { name: string; role: string; words: (transistors: string) => string; links: { href: string; label: string }[] }>;
  nextEyebrow: string;
  nextTitle: string;
  nextIntro: string;
  next: { name: string; about: string }[];
}

const EN: { hero: Hero; stations: Record<StationKey, StationWords>; machine: Machine } = {
  hero: {
    kicker: "A playground, not yet a page",
    title: "The NES at human speed",
    description:
      "A playground: the NES console's model slowed down until a person can watch it draw a frame, send it down the wire, and read a pad.",
    lead: (ms) => (
      <>
        Everything a Nintendo does to put one picture on a television happens in {ms} thousandths of a second. Here is
        the console the engineers rebuilt from the chips&rsquo; own transistors, running in this page, slowed down until
        you can watch it think.
      </>
    ),
  },
  stations: {
    tour: {
      eyebrow: "Start here",
      title: "A guided tour",
      body: (
        <>
          <p>
            This page is a workshop, not a book: the pieces are in no particular order, and any of them can be poked at
            on its own. If you would rather be shown around, this is one path through them.
          </p>
          <p>
            It starts with a picture on a television and ends inside a single chip, with a line at each stop saying what
            to look at. A bar follows you down the page while it runs, and you can leave it whenever you like.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes", label: "The console arc's notebook, if you would rather read the record" },
        { href: "/nes", label: "The NES section: the chips, the signal, the console and the bench" },
      ],
    },
    wire: {
      eyebrow: "The wire",
      title: "A picture is one long wiggle",
      body: (
        <>
          <p>
            The NES never sends a picture to the television. It sends one wire&rsquo;s worth of voltage that rises and
            falls, line after line, and the television rebuilds the picture from it. Click any line of the frame above
            and this is that line, exactly as the console&rsquo;s model encodes it.
          </p>
          <p>
            The deep dip is the <b>sync</b>: the television&rsquo;s cue to start a new line. The little wave after it is
            the <b>colour burst</b>, a metronome the television tunes to. Then the picture: how high the wire sits is how
            bright a dot is, and the fast wiggle on top carries its colour.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/ntsc-spec", label: "The signal path's specification" },
        { href: "/docs/nes/m1-report", label: "The NES encoder, checked against its reference" },
      ],
    },
    colours: {
      eyebrow: "The colours",
      title: "Every colour is a timing",
      body: (
        <>
          <p>
            The NES has a fixed set of colours: a handful of brightnesses, each crossed with every hue. Each colour here
            was made by the console&rsquo;s model and decoded by our model of a television, just now, in your browser.
            None of them came from a chart.
          </p>
          <p>
            Pick one. The wire swings up and down at the colour burst&rsquo;s own beat, and the only thing that changes
            the hue is <i>when</i> it swings. The clock face shows how far each colour&rsquo;s swing runs ahead of the
            burst: every hue has its own hour on the clock.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/p1-report", label: "The picture chip's colour output, checked against the table" },
        { href: "/docs/nes/eyes-vs-scope", label: "Where our colours and a real console's still differ" },
      ],
    },
    mario: {
      eyebrow: "A real game",
      title: "Where Super Mario Bros. spends a frame",
      body: (
        <>
          <p>
            The engineers ran Super Mario Bros. on the model and wrote down, for one ordinary frame, what the processor
            was doing while the beam was at each point on the screen. This map is their table, painted onto the frame.
          </p>
          <p>
            The surprise is the grey: most of the time, the game is doing nothing at all. It finishes its work early and
            waits. The top of the picture is spent waiting for the beam to pass the status bar, so the score can stay
            still while the level scrolls underneath.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/mario-dissection", label: "Super Mario Bros., dissected (the table this map is drawn from)" },
        { href: "/docs/nes/encyclopedia", label: "The encyclopedia of code patterns" },
      ],
    },
    pad: {
      eyebrow: "The controller",
      title: "Eight buttons down one wire",
      body: (
        <>
          <p>
            Inside the pad is one small chip that takes a snapshot of all eight buttons when the console asks, then hands
            them over one at a time, a bit per tick, down a single wire. Hold some buttons, on screen or on your keyboard
            with the frame above focused, and watch a read.
          </p>
          <p>A pressed button reads as a zero on the wire. The console flips it back.</p>
        </>
      ),
      record: [
        { href: "/docs/nes/bench-v1b", label: "How a console reads a pad, and the bridge that pretends to be one" },
        { href: "/docs/nes/encyclopedia", label: "The poll routine, entry one of the encyclopedia" },
      ],
    },
    difference: {
      eyebrow: "Spot the difference",
      title: "One button, one frame",
      body: (
        <>
          <p>
            Two consoles, the same cartridge, the same buttons, frame for frame. They are the same machine running the
            same program, so their pictures are the same. Now tap one button, for one frame, in one of them only.
          </p>
          <p>
            Whatever differs from then on is that tap&rsquo;s doing, and nothing else&rsquo;s. Sometimes the two pictures
            come back together a moment later; sometimes they never do. This is how the engineers find out what a game
            does with a button, with no source code at all: they run it twice and look for the difference.
          </p>
          <p>
            On the calibration cartridge the buttons are printed in its strip of black and white blocks, two frames after
            they were read. Watch for the block that lights, and how long it stays.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/encyclopedia", label: "The encyclopedia of code patterns (entry one, the x-ray below)" },
        { href: "/docs/nes/mario-dissection", label: "Super Mario Bros., dissected (from the pad to the jump)" },
        { href: "/docs/nes/exercise", label: "The exercise notebook: how the x-ray works" },
      ],
    },
    xray: {
      eyebrow: "Your own game",
      title: "X-ray something you own",
      body: (
        <>
          <p>
            The same trick, on a cartridge of your own. Play for a while: the page writes down which buttons you held on
            every frame, exactly as the engineers&rsquo; bench writes down a run. Then ask it to x-ray a tap at the
            moment you stopped.
          </p>
          <p>
            Both consoles replay everything you played, from the moment they were switched on, and one of them gets one
            extra tap. Anything they differ by after that is that tap&rsquo;s doing, and the report says when the
            pictures first parted, where on the screen, how far apart they got and whether they ever came back together.
          </p>
          <p>The cartridge is read in this browser and goes nowhere else.</p>
        </>
      ),
      record: [
        { href: "/docs/nes/exercise", label: "The exercise notebook: the x-ray, and the recordings it works from" },
        { href: "/docs/nes/mario-dissection", label: "What their x-ray found in Super Mario Bros." },
        { href: "/docs/nes/bench-script", label: "The bench script: one file both the bench and the model read" },
      ],
    },
    sound: {
      eyebrow: "The sound",
      title: "Five voices, one chip",
      body: (
        <>
          <p>
            All the NES&rsquo;s music comes from five voices inside the processor chip: two squares, a triangle, a noise
            maker and a player for recorded samples. A game makes music by writing a few numbers into the chip every so
            often: which note, how loud, what shape.
          </p>
          <p>
            Here you write those numbers by pressing keys. This is the engineers&rsquo; model of the sound hardware,
            built from measurements of the real chip&rsquo;s transistors, playing in your browser. Each voice is drawn as
            the chip produces it, and its pitch is measured from that drawing, not assumed.
          </p>
          <p>
            Mute a voice and listen to the others change slightly: the chip does not simply add its voices together. That
            mixing is written from the NES community&rsquo;s published table, and the engineers mark it as a claim they
            have not yet measured on their own console. The steady offset the chip&rsquo;s pins sit at is taken out
            before your speakers.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/a3-report", label: "First sound from the 2A03 (the mixer, a labelled claim)" },
        { href: "/docs/nes/n3-report", label: "The fast 2A03: the sound tables measured out of the chip" },
        { href: "/docs/nes/n7-report", label: "The console's sound, through the board's audio stage" },
      ],
    },
    slow: {
      eyebrow: "The slow chip",
      title: "Every transistor, switching",
      body: (
        <>
          <p>
            Before the engineers wrote a fast picture chip, they built a slow one: a simulation of every transistor on
            the real chip&rsquo;s silicon, switching on and off exactly as the photographs of the die say they are wired.
            Here it is, running in your browser, drawing the engineers&rsquo; test scene one dot at a time.
          </p>
          <p>
            Beside it is their fast chip&rsquo;s picture of the same scene. The fast one has to agree with the slow one
            on every single dot, and this page checks it as you watch. The lamps are the chip&rsquo;s own wires: its dot
            and line counters counting in binary, and the colour leaving the chip.
          </p>
          <p>
            The bars at the bottom are how many transistors change state for each dot. The chip fetches a new tile every
            few dots, and you can see its rhythm.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/p0-report", label: "The 2C02 at its switches" },
        { href: "/docs/nes/p1-report", label: "The 2C02's first picture (this scene)" },
        { href: "/docs/nes/p3-report", label: "The fast 2C02, dot for dot with the chip" },
      ],
    },
    die: {
      eyebrow: "The die",
      title: "The chip itself, lit up",
      body: (
        <>
          <p>
            This is the picture chip&rsquo;s own silicon: the shapes traced from photographs of a real chip with its
            casing removed, which is where every one of these models came from in the first place. The wires that are
            carrying a signal right now are lit, as the transistor-level chip runs in your browser.
          </p>
          <p>
            Point at anything to see which wire it is. Many of them have names, given by the people who traced the
            photographs, and those names are what the engineers&rsquo; reports talk about when they say a signal rose or
            a latch held.
          </p>
          <p>The colours are the layers: the metal on top, the silicon underneath, and the switching layer between.</p>
        </>
      ),
      record: [
        { href: "/docs/nes/p0-report", label: "The 2C02 at its switches (this chip, from this die data)" },
        { href: "/docs/nes/p1-report", label: "The 2C02's first picture" },
        { href: "/docs/words", label: "Words the reports use" },
      ],
    },
    program: {
      eyebrow: "Write a program",
      title: "Tell the chip what to do",
      body: (
        <>
          <p>
            A processor knows a few dozen instructions, and each one is tiny: put a number here, add one to it, compare
            it with something, go back a line. Games are made of nothing else. Here are a few lines you can change and
            run.
          </p>
          <p>
            It runs on the 6502 itself, the transistor-level one this shop serves over its own interface, an instruction
            at a time. A, X and Y are the three places the chip can hold a number while it works; the grid at the bottom
            is the first page of its memory, and you can watch your program change it.
          </p>
          <p>
            It is the same processor as the one inside the NES, which is where all of this started: the console&rsquo;s
            chip is this one with its sound hardware beside it on the same piece of silicon.
          </p>
        </>
      ),
      record: [
        { href: "/6502/api", label: "The 6502 API: the chip over HTTP, a half-cycle at a time" },
        { href: "/6502/primer", label: "The primer: the chip explained properly" },
        { href: "/docs/nes/n3-report", label: "The NES's own 6502, checked against the die" },
      ],
    },
    bench: {
      eyebrow: "The bench",
      title: "A real console, watched",
      body: (
        <>
          <p>
            None of this would settle anything without a real NES on a table. The engineers built a bench around one: a
            little board that presses its buttons, a laboratory scope on its video wire, and cameras on a frame watching
            the whole thing, so a run can be repeated exactly and what happened can be looked at afterwards.
          </p>
          <p>
            These are their own photographs, with their own captions. Pick one to see it; the parts listed under each are
            what their caption names, in the order they wrote them.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/rig", label: "The QA rig: the cameras and boards, in inches and pixels" },
        { href: "/docs/nes/lab-notebook", label: "The lab notebook: the bench wired one step at a time" },
        { href: "/docs/nes/milestone-rig-and-bridge", label: "The rig locked and the bridge reading right" },
      ],
    },
    patterns: {
      eyebrow: "The encyclopedia",
      title: "Tricks every game uses",
      body: (
        <>
          <p>
            Taking games apart, the engineers keep finding the same tricks: the same few ways of reading the pad,
            switching memory, keeping time and changing the picture without tearing it. They are writing them down as an
            encyclopedia of code patterns.
          </p>
          <p>
            Each picture here is one entry&rsquo;s mechanism, drawn by us and moving. They are sketches, not recordings:
            no address or number in them is the game&rsquo;s. The entry&rsquo;s own words are beside each, and the full
            entry, with everything the engineers measured, is one click away.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/encyclopedia", label: "The encyclopedia of code patterns" },
        { href: "/docs/nes/mario-dissection", label: "Super Mario Bros., dissected (where most were found)" },
      ],
    },
    real: {
      eyebrow: "Real or model",
      title: "The same screen, three ways",
      body: (
        <>
          <p>
            The engineers put a real NES and their model side by side on the same cartridge&rsquo;s title screen, and
            looked at the real one twice: once through a laboratory scope decoded by their own software, once through a
            cheap USB video grabber. Two different eyes on one real signal, and the model beside them.
          </p>
          <p>
            The two real pictures agree closely. The model agrees on almost everything, but some colours are off: its
            cyan is a little bluer, its brown a little warmer. Slide, blink or subtract to see it, and point at a colour
            to measure it yourself.
          </p>
          <p>
            The engineers tracked it down. The real chip&rsquo;s output slows down on its brighter colours, and that
            shifts their hue; the model&rsquo;s signal is too perfect to do it. Teaching the model that imperfection is
            still on their list.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/eyes-vs-scope", label: "Eyes versus scope (where these pictures and figures come from)" },
        { href: "/docs/nes/open-items", label: "What is still open (the model's hue)" },
      ],
    },
    museum: {
      eyebrow: "The bug museum",
      title: "Every wrong turn, kept",
      body: (
        <>
          <p>
            Building a machine this carefully means being wrong a lot, and catching it. The engineers keep every mistake
            in their reports, beside the fix, instead of tidying it away. Here are some of the best.
          </p>
          <p>
            Some bugs lived in the model, some in the bench wired to the real console, some in the tools, and some in the
            measuring itself. Each plaque says what you would have seen, why it happened and how it was caught; below it
            are the engineers&rsquo; own words, read from their reports.
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/cartridge", label: "A real cartridge in the model" },
        { href: "/docs/nes/bench-report", label: "What the bench's tools have shown" },
        { href: "/docs/nes/open-items", label: "What is still open" },
      ],
    },
    arc: {
      eyebrow: "How it was built",
      title: "A fortnight of afternoons",
      body: (
        <>
          <p>
            The whole console, from the first sketch to a real NES wired to the model, was built in a few weeks, and
            every step of it was written down twice: a plan saying what would be checked, and a report saying what was
            found. This is all of it on one rail of days.
          </p>
          <p>
            The shape tells the story. The television signal was finished almost at once; the two chips took a few days
            each, once at the level of their transistors and again as fast copies that had to agree; then the console,
            and then two weeks of building a bench out of real hardware, which is where most of the days went.
          </p>
          <p>Pick any stop to see what that document is about, and follow it if you want the detail.</p>
        </>
      ),
      record: [
        { href: "/docs/nes", label: "The console arc's notebook (every document, grouped)" },
        { href: "/docs/nes/sketch", label: "The plan for the whole console, written before the code" },
        { href: "/docs/nes/open-items", label: "What is still open" },
      ],
    },
  },
  machine: {
    eyebrow: "The machine",
    title: "A handful of parts, one clock",
    intro:
      "Everything above is these parts talking. The processor runs the game and leaves notes for the picture chip; the picture chip reads the cartridge's tiles and walks the beam; the television turns the wire back into light. Each part below links to where the engineers took it apart.",
    caption:
      "The processor and the picture chip never share a clock tick by accident: both count off the same crystal, and the engineers checked every way the two can line up at power on.",
    diagram:
      "The NES as a diagram: the crystal clocks both chips; the processor reads the pad and the cartridge's program and leaves notes for the picture chip; the picture chip reads the cartridge's tiles; the picture and the sound go to the television.",
    parts: {
      cpu: {
        name: "The 2A03",
        role: "the brain, and the sound",
        words: (t) =>
          `A 6502 processor, the same family as the Apple II's, with the sound hardware on the same piece of silicon. The engineers simulated all ${t} of its working transistors, switch by switch, and then built a fast copy that has to agree with the slow one.`,
        links: [
          { href: "/docs/nes/a0-report", label: "The 2A03 at its switches" },
          { href: "/docs/nes/n3-report", label: "The fast 2A03, built and checked" },
          { href: "/docs/nes/a3-report", label: "First sound from the 2A03" },
        ],
      },
      ppu: {
        name: "The 2C02",
        role: "the picture chip",
        words: () =>
          "It walks the beam across the screen dot by dot, fetching the background and the sprites just in time for each one. The processor never draws anything: it only leaves notes for this chip.",
        links: [
          { href: "/docs/nes/p0-report", label: "The 2C02 at its switches" },
          { href: "/docs/nes/p2-report", label: "The 2C02's hard corners" },
          { href: "/docs/nes/p3-report", label: "The fast 2C02, dot for dot with the chip" },
        ],
      },
      cart: {
        name: "The cartridge",
        role: "the game, and its pictures",
        words: () =>
          "Two memory chips on a board: one holds the program the processor runs, the other the little tiles the picture chip draws with. Bigger games add a chip that swaps banks of memory in and out.",
        links: [
          { href: "/docs/nes/cartridge", label: "A real cartridge in the model" },
          { href: "/docs/nes/n0-report", label: "The contract the chips share, the cartridge edge included" },
        ],
      },
      glue: {
        name: "The board",
        role: "the glue between them",
        words: () =>
          "A crystal that keeps time for everyone, a little working memory, and a handful of simple chips that decide who is talking on the shared wires at any moment.",
        links: [
          { href: "/docs/nes/n4-report", label: "The mainboard's glue" },
          { href: "/docs/nes/n5-report", label: "Both chips on one clock" },
        ],
      },
      tv: {
        name: "The television",
        role: "where it all ends up",
        words: () =>
          "An analogue signal on one wire, and a tube that paints it back into light. The engineers modelled that too, because the picture you remember was made as much by the television as by the console.",
        links: [
          { href: "/docs/nes/ntsc-spec", label: "The signal path's specification" },
          { href: "/docs/nes/m3-report", label: "The television's picture stages" },
          { href: "/docs/nes/eyes-vs-scope", label: "Eyes versus scope: the real console against the model" },
        ],
      },
    },
    nextEyebrow: "On the bench next",
    nextTitle: "Ideas this playground could grow",
    nextIntro: "Proposals, not promises. Each would draw on something the engineers have already measured or built.",
    next: [
      {
        name: "The sound beside a real console's",
        about: "The engineers hold their sound against recordings of real hardware. The same comparison here: a note from the model and the same note from a real chip, one after the other, with what differs marked.",
      },
      {
        name: "The signal on a real scope",
        about: "Their scope's recording of a real console's video wire, drawn beside the model's own signal for the same screen, so a reader can see how close the wiggle is.",
      },
      {
        name: "The cartridge, opened",
        about: "What is actually inside the plastic: the two memories, the board that swaps them, and the reader the engineers built to dump one, with their photographs.",
      },
    ],
  },
};

const JA: { hero: Hero; stations: Record<StationKey, StationWords>; machine: Machine } = {
  hero: {
    kicker: "まだページではなく、実験場",
    title: "人の速さで見るファミコン",
    description: "実験場です。ファミコンの模型を、フレームを描き、線に送り出し、パッドを読むところが人の目で追えるまで遅くしてあります。",
    lead: (ms) => (
      <>
        テレビに絵を一枚映すために、ファミコンがすることの全部が{ms}ミリ秒で終わります。ここで動いているのは、
        エンジニアたちがチップのトランジスタから組み直したコンソールです。考えている様子が見えるところまで、速度を落としてあります。
      </>
    ),
  },
  stations: {
    tour: {
      eyebrow: "ここから",
      title: "案内つきで一周する",
      body: (
        <>
          <p>
            このページは本ではなく作業場です。部品に決まった順番はなく、どれからでも触れます。
            案内が欲しいときのために、一本の道を用意しました。
          </p>
          <p>
            テレビの絵から始まり、チップ一枚の中で終わります。各駅に、何を見ればいいかを一行だけ添えました。
            案内中は下に帯が付いてきて、いつでもやめられます。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes", label: "記録のほうを読むなら: コンソール開発のノート" },
        { href: "/nes", label: "NES のセクション: チップ、信号、コンソール、ベンチ" },
      ],
    },
    wire: {
      eyebrow: "一本の線",
      title: "絵は、長いうねり一本",
      body: (
        <>
          <p>
            ファミコンはテレビに絵を送りません。送るのは一本の線の電圧だけで、それが上下しながら一行ずつ流れ、
            テレビがそこから絵を組み立てます。上のフレームの走査線をどれか選ぶと、模型がその行を符号化したとおりの波が出ます。
          </p>
          <p>
            深く落ち込むところが<b>同期</b>、テレビに新しい行の始まりを知らせる合図です。その後ろの小さな波が
            <b>カラーバースト</b>、テレビが合わせる拍子です。その先が絵で、線の高さが明るさ、上に乗った速い揺れが色を運びます。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/ntsc-spec", label: "信号経路の仕様" },
        { href: "/docs/nes/m1-report", label: "NES のエンコーダ、参照実装と突き合わせた記録" },
      ],
    },
    colours: {
      eyebrow: "色",
      title: "色とは、タイミングのこと",
      body: (
        <>
          <p>
            ファミコンが出せる色は決まっています。明るさが数段階、それぞれに色相が並びます。
            ここに並ぶ色は、いま、あなたのブラウザの中で、コンソールの模型が作り、テレビの模型が復号したものです。表を写したものは一つもありません。
          </p>
          <p>
            どれか選んでください。線はカラーバーストと同じ拍子で上下し、色相を決めるのは<i>いつ</i>揺れるかだけです。
            時計の文字盤は、各色の揺れがバーストからどれだけ進んでいるかを示します。色相ごとに、自分の時刻があります。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/p1-report", label: "絵のチップの色出力、表と突き合わせた記録" },
        { href: "/docs/nes/eyes-vs-scope", label: "実機と模型で、色がまだ食い違うところ" },
      ],
    },
    mario: {
      eyebrow: "実際のゲーム",
      title: "スーパーマリオブラザーズの一フレーム",
      body: (
        <>
          <p>
            エンジニアたちは模型でスーパーマリオブラザーズを走らせ、ごく普通の一フレームについて、
            ビームが画面のどこにいるとき CPU が何をしていたかを書き出しました。この地図は、その表をフレームの上に塗ったものです。
          </p>
          <p>
            意外なのは灰色の広さです。ゲームはほとんどの時間、何もしていません。仕事を早めに終えて待っています。
            画面の上のほうは、ビームがステータスバーを通り過ぎるのを待つ時間です。スコアを止めたまま、下の世界だけを動かすためです。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/mario-dissection", label: "スーパーマリオブラザーズの解剖 (この地図の元になった表)" },
        { href: "/docs/nes/encyclopedia", label: "コードパターンの事典" },
      ],
    },
    pad: {
      eyebrow: "コントローラ",
      title: "八つのボタンが、一本の線を通る",
      body: (
        <>
          <p>
            パッドの中には小さなチップが一つ入っていて、コンソールに聞かれた瞬間に八つのボタンをまとめて写し取り、
            あとは一本の線で、一拍に一ビットずつ渡していきます。画面のボタンか、上のフレームを選んだ状態でキーボードを押して、読み取りを見てください。
          </p>
          <p>押されたボタンは線の上では 0 です。コンソールがそれを裏返して読みます。</p>
        </>
      ),
      record: [
        { href: "/docs/nes/bench-v1b", label: "コンソールがパッドを読む仕組みと、パッドの振りをするブリッジ" },
        { href: "/docs/nes/encyclopedia", label: "事典の一項目め、読み取りルーチン" },
      ],
    },
    difference: {
      eyebrow: "間違い探し",
      title: "ボタン一つ、一フレームだけ",
      body: (
        <>
          <p>
            コンソールを二台、同じカセット、同じボタン、フレーム単位で同じ入力。同じ機械が同じプログラムを走らせているので、
            絵も同じです。そこで、片方にだけ、一フレームぶんボタンを一つ足します。
          </p>
          <p>
            そこから先で違うところは、すべてその一押しのせいで、ほかの何のせいでもありません。
            少し後でまた一致することもあれば、二度と戻らないこともあります。ソースコードが一行もなくても、
            ゲームがボタンで何をしているかはこうして分かります。二回走らせて、違いを見るだけです。
          </p>
          <p>
            校正カセットでは、ボタンは白黒のブロックの帯に、読まれた二フレーム後に印刷されます。
            どのブロックが光り、どれだけ光り続けるかを見てください。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/encyclopedia", label: "コードパターンの事典 (一項目め、下の X 線)" },
        { href: "/docs/nes/mario-dissection", label: "スーパーマリオブラザーズの解剖 (パッドからジャンプまで)" },
        { href: "/docs/nes/exercise", label: "運用ノート: X 線の仕組み" },
      ],
    },
    xray: {
      eyebrow: "あなたのゲーム",
      title: "手持ちのカセットを X 線にかける",
      body: (
        <>
          <p>
            同じやり方を、あなたのカセットで。しばらく遊んでください。ページは各フレームでどのボタンを押していたかを書き留めます。
            エンジニアたちのベンチが走行を書き留めるのと同じです。そのうえで、やめた瞬間の一押しを X 線にかけます。
          </p>
          <p>
            二台のコンソールが、電源を入れたところからあなたの操作をそのまま再生し、片方にだけ一押しが足されます。
            その後で二台が違うところは、すべてその一押しのせいです。報告には、絵が最初に分かれたフレーム、画面のどこか、
            どれだけ離れたか、また一致したかどうかが出ます。
          </p>
          <p>カセットはこのブラウザの中だけで読まれ、どこにも送られません。</p>
        </>
      ),
      record: [
        { href: "/docs/nes/exercise", label: "運用ノート: X 線と、その元になる記録" },
        { href: "/docs/nes/mario-dissection", label: "彼らの X 線がスーパーマリオブラザーズで見つけたもの" },
        { href: "/docs/nes/bench-script", label: "ベンチスクリプト: ベンチと模型が同じ一つのファイルを読む" },
      ],
    },
    sound: {
      eyebrow: "音",
      title: "一つのチップに、五つの声",
      body: (
        <>
          <p>
            ファミコンの音楽は、CPU チップの中の五つの声から出ています。矩形波が二つ、三角波、ノイズ、
            それに録音を鳴らすものが一つ。ゲームは時々チップに数字をいくつか書き込むことで音楽を作ります。どの音か、どれだけ大きいか、どんな形か。
          </p>
          <p>
            ここでは、その数字をあなたが鍵盤で書き込みます。動いているのは、実チップのトランジスタから測って作られた、
            エンジニアたちの音回路の模型です。各声はチップが出しているとおりに描かれ、音の高さはその波形から測った値で、決め打ちではありません。
          </p>
          <p>
            一つ消してみると、ほかの声がわずかに変わります。チップは声を単純に足しているわけではないからです。
            その混ぜ方は NES コミュニティが公開した表から書き起こしたもので、エンジニアたちは自分の実機ではまだ測っていない主張として印をつけています。
            チップのピンが乗っている一定の直流分は、スピーカーに届く前に抜いてあります。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/a3-report", label: "2A03 から出た最初の音 (ミキサーは、ラベル付きの主張)" },
        { href: "/docs/nes/n3-report", label: "高速版 2A03: チップから測り出した音のテーブル" },
        { href: "/docs/nes/n7-report", label: "基板のオーディオ段を通したコンソールの音" },
      ],
    },
    slow: {
      eyebrow: "遅いチップ",
      title: "トランジスタが、一つずつ切り替わる",
      body: (
        <>
          <p>
            高速な絵のチップを書く前に、エンジニアたちは遅いほうを作りました。実チップのシリコン上のトランジスタを一つ残らず、
            ダイの写真が示す配線のとおりに切り替える模擬です。それがいま、あなたのブラウザの中で、試験用の画面を一ドットずつ描いています。
          </p>
          <p>
            隣は、同じ画面を高速版が描いたものです。高速版は遅いほうと全ドットで一致しなければならず、このページはそれを見ている間に確かめています。
            ランプはチップ自身の配線です。ドットと走査線のカウンタが二進で数え、色がチップから出ていきます。
          </p>
          <p>
            下の棒は、各ドットで状態が変わったトランジスタの数です。チップは数ドットごとに新しいタイルを取りに行くので、その拍子が見えます。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/p0-report", label: "スイッチレベルの 2C02" },
        { href: "/docs/nes/p1-report", label: "2C02 の最初の絵 (この画面)" },
        { href: "/docs/nes/p3-report", label: "高速版 2C02、チップとドット単位で一致" },
      ],
    },
    die: {
      eyebrow: "ダイ",
      title: "チップそのものが光る",
      body: (
        <>
          <p>
            これは絵のチップのシリコンそのものです。封止を外した実チップの写真からなぞられた形で、
            ここにあるすべての模型は、もともとここから来ています。いま信号を通している配線が光ります。トランジスタ単位のチップが、あなたのブラウザで動いています。
          </p>
          <p>
            どこかを指すと、それがどの配線かが出ます。多くには、写真をなぞった人たちが付けた名前があり、
            エンジニアたちの報告が「この信号が立った」「このラッチが保持した」と書くときの名前は、この名前です。
          </p>
          <p>色は層です。上の金属、下のシリコン、その間の切り替えの層。</p>
        </>
      ),
      record: [
        { href: "/docs/nes/p0-report", label: "スイッチレベルの 2C02 (このダイデータから作られたチップ)" },
        { href: "/docs/nes/p1-report", label: "2C02 の最初の絵" },
        { href: "/docs/words", label: "報告で使う言葉" },
      ],
    },
    program: {
      eyebrow: "プログラムを書く",
      title: "チップに用事を言いつける",
      body: (
        <>
          <p>
            プロセッサが知っている命令は数十個で、どれも小さなことしかしません。ここに数を置く、一を足す、何かと比べる、一行戻る。
            ゲームはそれだけでできています。書き換えて走らせられる数行を用意しました。
          </p>
          <p>
            動かしているのは 6502 そのもの、この工房が自前の窓口で提供しているトランジスタレベルのチップで、一命令ずつ進みます。
            A、X、Y は、チップが作業中に数を置いておける三つの場所です。下の格子はメモリの最初の一ページで、プログラムがそこを書き換える様子が見えます。
          </p>
          <p>
            これはファミコンの中のプロセッサと同じもので、すべてはここから始まりました。
            コンソールのチップは、これと同じ石の上に音の回路を並べたものです。
          </p>
        </>
      ),
      record: [
        { href: "/6502/api", label: "6502 API: HTTP 越しのチップ、半サイクル単位" },
        { href: "/6502/primer", label: "入門: チップをきちんと説明したもの" },
        { href: "/docs/nes/n3-report", label: "ファミコンの 6502、ダイと突き合わせた記録" },
      ],
    },
    bench: {
      eyebrow: "ベンチ",
      title: "実機を、見張る",
      body: (
        <>
          <p>
            机の上の実機がなければ、どれも決着しません。エンジニアたちはその周りにベンチを組みました。
            ボタンを押す小さな基板、映像線につないだオシロスコープ、そして全体を見張るフレーム上のカメラ。
            走行をそのまま繰り返せて、あとから何が起きたかを見られるようにするためです。
          </p>
          <p>
            以下は彼ら自身の写真と、彼ら自身のキャプションです。選ぶと表示されます。下に並ぶのは、そのキャプションが挙げているものを、書かれた順に並べたものです。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/rig", label: "QA リグ: カメラと基板の位置、インチとピクセルで" },
        { href: "/docs/nes/lab-notebook", label: "ラボノート: 一手ずつ配線されたベンチ" },
        { href: "/docs/nes/milestone-rig-and-bridge", label: "リグが固定され、ブリッジが正しく読めた日" },
      ],
    },
    patterns: {
      eyebrow: "事典",
      title: "どのゲームも使う手",
      body: (
        <>
          <p>
            ゲームを分解していると、同じ手が何度も出てきます。パッドの読み方、メモリの切り替え方、時間の測り方、
            絵を崩さずに書き換える方法。エンジニアたちはそれをコードパターンの事典として書き留めています。
          </p>
          <p>
            ここの絵は、各項目の仕組みを私たちが描いて動かしたものです。記録ではなく図解で、
            中の番地や数値はどれも特定のゲームのものではありません。項目自身の言葉を横に添えてあり、
            測定を含む全文は一クリック先にあります。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/encyclopedia", label: "コードパターンの事典" },
        { href: "/docs/nes/mario-dissection", label: "スーパーマリオブラザーズの解剖 (多くはここで見つかった)" },
      ],
    },
    real: {
      eyebrow: "実機か模型か",
      title: "同じ画面を、三通りで",
      body: (
        <>
          <p>
            エンジニアたちは、同じカセットのタイトル画面で実機と模型を並べ、実機のほうは二回見ました。
            一度はオシロスコープで録って自前のソフトで復号し、もう一度は安価な USB キャプチャで。
            一つの実信号に対する二つの目と、その隣に模型です。
          </p>
          <p>
            実機の二枚はよく一致します。模型もほとんど一致しますが、色がいくらかずれます。シアンはやや青く、茶色はやや暖かい。
            スライド、点滅、差分で見比べ、色を指して自分で測ってみてください。
          </p>
          <p>
            原因は突き止められています。実チップの出力は明るい色ほど立ち上がりが鈍り、それが色相をずらします。
            模型の信号はきれい過ぎて、そうはなりません。その不完全さを模型に教えるのは、まだ宿題です。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/eyes-vs-scope", label: "目とオシロスコープ (この写真と数値の出どころ)" },
        { href: "/docs/nes/open-items", label: "未了のこと (模型の色相)" },
      ],
    },
    museum: {
      eyebrow: "バグ博物館",
      title: "間違いは、全部とってある",
      body: (
        <>
          <p>
            これだけ丁寧に機械を組むということは、何度も間違え、そのたびに捕まえるということです。
            エンジニアたちは片付けてしまわずに、直し方の隣に間違いをそのまま残しています。その中から何点か。
          </p>
          <p>
            模型の中にいたバグ、実機につながれたベンチにいたバグ、道具にいたバグ、そして測り方そのものにいたバグ。
            各プレートには、何が見えたか、なぜ起きたか、どう捕まえたかが書いてあります。その下は、彼ら自身の報告から読み込んだ彼らの言葉です。
          </p>
        </>
      ),
      record: [
        { href: "/docs/nes/cartridge", label: "実カセットを模型に入れる" },
        { href: "/docs/nes/bench-report", label: "ベンチの道具が示したこと" },
        { href: "/docs/nes/open-items", label: "未了のこと" },
      ],
    },
    arc: {
      eyebrow: "作られ方",
      title: "二週間ぶんの午後",
      body: (
        <>
          <p>
            最初のスケッチから、模型につながれた実機まで、コンソール全体は数週間で組み上がりました。
            そのどの一歩も二度書かれています。何をどこまで確かめるかを先に書いた計画と、何が分かったかを書いた報告です。それを日付の一本の線に並べました。
          </p>
          <p>
            形がそのまま物語です。テレビ信号はほとんど即日で片付き、二つのチップはそれぞれ数日。
            一度はトランジスタの高さで、もう一度は一致しなければならない高速版として。それからコンソール、
            そして実物のハードウェアでベンチを組む二週間。日数の大半はここです。
          </p>
          <p>どの駅を選んでも、その文書が何についてのものか出ます。詳しく知りたければそのまま辿ってください。</p>
        </>
      ),
      record: [
        { href: "/docs/nes", label: "コンソール開発のノート (全文書、分類つき)" },
        { href: "/docs/nes/sketch", label: "コード以前に書かれた、コンソール全体の計画" },
        { href: "/docs/nes/open-items", label: "未了のこと" },
      ],
    },
  },
  machine: {
    eyebrow: "機械",
    title: "少しの部品と、一つの時計",
    intro:
      "ここまで見てきたものは、全部この部品たちのやり取りです。CPU はゲームを走らせて絵のチップに指示を残し、絵のチップはカセットのタイルを読んでビームを走らせ、テレビが線の信号を光に戻します。下の各部品から、エンジニアたちがそれを分解した先へ行けます。",
    caption:
      "CPU と絵のチップが偶然同じ時計の刻みを共有することはありません。二つとも同じ水晶を数えていて、電源投入時に両者が取りうる位相の合い方は、エンジニアたちが全部確かめています。",
    diagram:
      "ファミコンの図: 水晶が両方のチップを刻み、CPU はパッドとカセットのプログラムを読んで絵のチップに指示を残し、絵のチップはカセットのタイルを読み、絵と音がテレビへ向かう。",
    parts: {
      cpu: {
        name: "2A03",
        role: "頭脳と、音",
        words: (t) =>
          `6502 プロセッサ。Apple II と同じ系統で、同じ石の上に音の回路が載っています。エンジニアたちは、動作しているトランジスタ ${t} 個すべてをスイッチ単位で模擬し、そのうえで、遅いほうと一致しなければならない高速版を作りました。`,
        links: [
          { href: "/docs/nes/a0-report", label: "スイッチレベルの 2A03" },
          { href: "/docs/nes/n3-report", label: "高速版 2A03、組んで確かめた記録" },
          { href: "/docs/nes/a3-report", label: "2A03 から出た最初の音" },
        ],
      },
      ppu: {
        name: "2C02",
        role: "絵のチップ",
        words: () =>
          "画面をドット単位でビームが走り、その一つ一つに間に合うように背景とスプライトを取りに行きます。CPU は何も描きません。このチップに指示を残すだけです。",
        links: [
          { href: "/docs/nes/p0-report", label: "スイッチレベルの 2C02" },
          { href: "/docs/nes/p2-report", label: "2C02 の難所" },
          { href: "/docs/nes/p3-report", label: "高速版 2C02、チップとドット単位で一致" },
        ],
      },
      cart: {
        name: "カセット",
        role: "ゲームと、その絵",
        words: () =>
          "基板の上のメモリ二つ。片方は CPU が走らせるプログラム、もう片方は絵のチップが描くのに使う小さなタイル。大きなゲームは、メモリの面を差し替えるチップを足します。",
        links: [
          { href: "/docs/nes/cartridge", label: "実カセットを模型に入れる" },
          { href: "/docs/nes/n0-report", label: "チップが共有する規約、カセット端子も含めて" },
        ],
      },
      glue: {
        name: "基板",
        role: "間をつなぐもの",
        words: () =>
          "全員のために時間を刻む水晶、少しの作業用メモリ、そして、いまどれが共有の線で話しているかを決める単純なチップが数個。",
        links: [
          { href: "/docs/nes/n4-report", label: "メインボードの接着剤" },
          { href: "/docs/nes/n5-report", label: "二つのチップを一つのクロックで" },
        ],
      },
      tv: {
        name: "テレビ",
        role: "行き着く先",
        words: () =>
          "一本の線のアナログ信号と、それを光に塗り戻すブラウン管。エンジニアたちはそこも模型にしました。記憶にあるあの絵は、コンソールと同じくらいテレビが作っていたからです。",
        links: [
          { href: "/docs/nes/ntsc-spec", label: "信号経路の仕様" },
          { href: "/docs/nes/m3-report", label: "テレビの描画段" },
          { href: "/docs/nes/eyes-vs-scope", label: "目とオシロスコープ: 実機と模型" },
        ],
      },
    },
    nextEyebrow: "次の工作",
    nextTitle: "この実験場がこれから育てられるもの",
    nextIntro: "約束ではなく提案です。どれもエンジニアたちがすでに測ったか作ったものの上に乗ります。",
    next: [
      {
        name: "実機の音と並べて",
        about: "エンジニアたちは自分たちの音を実機の録音と突き合わせています。同じ比較をここでも。模型の一音と実チップの同じ一音を続けて鳴らし、違うところに印をつける。",
      },
      {
        name: "実機の波形をオシロスコープで",
        about: "実機の映像線をオシロスコープで録ったものを、同じ画面の模型の信号と並べて描く。うねりがどれだけ近いかが目で見える。",
      },
      {
        name: "カセットを開ける",
        about: "プラスチックの中身: 二つのメモリ、それを差し替える基板、そしてエンジニアたちが吸い出しのために作ったリーダー。彼らの写真つきで。",
      },
    ],
  },
};

export const WORDS = { en: EN, ja: JA } as const;

export function words(lang: Lang) {
  return WORDS[lang] ?? WORDS.en;
}
