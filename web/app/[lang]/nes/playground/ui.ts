import type { Lang } from "@/lib/lang";

/**
 * The playground's controls and readouts, both languages, beside each
 * other: what the buttons say, what the fixed cells are called, and the
 * short lines the instruments print as they run.
 *
 * The page's longer prose is in words.tsx; the engineers' own words are
 * never here, because they are read from their documents and shown as
 * they wrote them. The busiest instruments keep their own words next to
 * themselves, in ui.<station>.ts, for the same reason.
 *
 * A reading that is a figure stays a figure ("186 ns", "$2A"): only its
 * label and its words are translated.
 */

const EN = {
  station: { deeper: "Go deeper: the engineers' record" },
  machine: {
    names: { pad: "Pad", crystal: "Crystal", cart: "Cartridge", tv: "Television" },
    roles: {
      pad: "eight buttons",
      crystal: "keeps time",
      cpu: "the brain and the sound",
      ppu: "the picture chip",
      cart: "program and tiles",
      tv: "light, from one wire",
    },
    wires: { buttons: "buttons", ticks: "ticks", notes: "notes", program: "program", tiles: "tiles", sound: "sound", picture: "picture" },
  },
  common: {
    play: "Play",
    pause: "Pause",
    nextFrame: "Next frame",
    cartridge: "Cartridge",
    yourOwn: "Your own .nes",
    waiting: "Waking the console up...",
    none: "·",
    noSlow: "The slow chip is not in this build: scripts/build-playground-wasm.py makes it, from the engineers' checkout.",
    noDie: "The die needs the slow chip's bundle, which is not in this build.",
  },
  hero: {
    paces: {
      real: "Real speed",
      second: "A frame a second",
      ten: "A frame in ten seconds",
      minute: "A frame a minute",
    },
    howFast: "How fast",
    throughTv: "Through the television's signal",
    scrub: "Where the beam is in the frame",
    stage:
      "The console's frame. Focus it to play with the keyboard: arrows, X for A, Z for B, Enter for Start.",
    field: "The whole frame the beam walks, picture and blanking",
    zonePicture: "the picture you see",
    zoneRight: "the beam flies back",
    zoneBottom: "the beam climbs back to the top: a game's quiet moment to change the picture",
    cells: {
      line: "Line",
      dot: "Dot",
      beam: "Beam",
      time: "Into the frame",
      each: "One dot lasts",
      slower: "Slower than real",
    },
    beamDrawing: "drawing",
    beamTop: "off: to the top",
    beamLeft: "off: to the left",
    beamFast: "too fast to see",
    carts: {
      bars: {
        name: "Colour bars",
        about: "Every hue at one brightness, the brightness stepping every few seconds. Nobody's game: we wrote it to test the picture.",
      },
      cal: {
        name: "The calibration cartridge",
        about: "The screens we show a real console and the model, so the two pictures can be compared.",
      },
      pad: { name: "The pad tester", about: "Press buttons below and watch the console notice." },
      own: "Read from your disk into this browser, and nowhere else. Only the simplest cartridge boards load; anything else is refused by name.",
    },
    pad: "The controller",
  },
  wire: {
    line: (n: number) => `Line ${n}`,
    ofFrame: " of the frame, as volts on the wire. Point at it to magnify.",
    trace: (n: number) => `Line ${n} of the frame as a voltage trace, with the sync, the colour burst and the picture marked`,
    encoding: "Encoding the frame...",
    hint: "Point at the trace: the lens shows the few dots under the pointer, sample by sample.",
    dot: (dot: number, code: string, step: number, hue: number, samples: number) =>
      `Dot ${dot}: colour $${code}, brightness step ${step}, hue ${hue}. Each dot is ${samples} samples of the wire.`,
    burst: (period: string, dots: string) =>
      `The colour burst: a few cycles of the colour beat, so the television can set its clock by it. The beat takes ${period} samples, which is ${dots} dots.`,
    sync: "The sync: the wire drops below black, and the television starts a new line.",
    blanking: "Blanking: the wire rests at black while the beam is off.",
    bands: { picture: "picture", sync: "sync", burst: "burst" },
  },
  colours: {
    measuring: "Measuring the colours...",
    swatches: "The console's colours, by brightness step and hue",
    swatch: (code: string) => `colour $${code}`,
    reading: (step: number, hue: number) => `Brightness step ${step}, hue ${hue}.`,
    grey: "No swing at all: a grey, or black. Only the height of the wire matters.",
    angle: (deg: number) => `Its swing sits ${deg} degrees round the clock from the burst.`,
    volts: (mean: string, swing: string) => `The wire sits at ${mean} volts on average and swings ${swing} either side.`,
    plot: "Four beats of the burst above four beats of the picked colour",
    clock: "The hue clock: each hue's swing measured against the burst",
    burstLabel: "the burst",
    colourLabel: (code: string) => `colour $${code}`,
    note: "The teal hand is the burst, the television's reference. The coloured hand is the colour picked: its angle is the hue, its length how strongly the wire swings. The dots round the rim are every hue we measured on this row.",
  },
  mario: {
    waiting: "Waiting for the console to report the frame's shape...",
    missing: (reason: string) =>
      `The map is drawn from the dissection's table, and this build could not read it: ${reason}. Nothing is drawn in its place.`,
    map: (frame: string) => `Frame ${frame} of Super Mario Bros., coloured by what the processor was doing at each point of the beam`,
    sweep: "Sweep the beam",
    scrub: "Where the beam is in Mario's frame",
    kinds: {
      wait: "waiting for the beam",
      logic: "the game's own work",
      busy: "talking to the picture chip, the sound and the pad",
      copy: "copying the sprites across (the processor is frozen)",
      idle: "nothing at all: done, and waiting for the next frame",
    },
    now: (line: number, what: string, ms: string) => `Line ${line}: ${what}. ${ms} ms into the frame.`,
    rowPos: (line: string, dot: number | null) => `line ${line}${dot != null ? `, dot ${dot}` : ""}`,
    at: " at ",
    fallback: "The engineers' words are below.",
    shares: "Share of the frame, counted dot by dot from the table's stretches",
    note: "The shares are counted dot by dot from the table's own lines and dots, so they are the table's clock, not a stopwatch. The dissection's profiler has its own figure for the idle time.",
  },
  padStation: {
    hold: "Tap to hold a button down; tap again to let go.",
    buttons: "The pad's buttons",
    snapshot: "Inside the pad: the snapshot",
    byte: "Inside the console: the byte",
    watch: "Watch the console read the pad",
    ready: "Ready.",
    latch: "The console pulses the latch: the pad freezes a snapshot of all its buttons.",
    tick: (n: number, name: string, low: boolean) =>
      `Tick ${n}: ${name} goes down the wire, ${low ? "low, because it is pressed" : "high, because it is not"}.`,
    done: "Done: the whole byte, one bit per tick. A real game does this every frame, faster than you can blink.",
    held: "held",
    names: { a: "A", b: "B", select: "Select", start: "Start", up: "Up", down: "Down", left: "Left", right: "Right" },
  },
  tour: {
    start: "Start the tour",
    again: "Start again",
    about: "About twenty minutes, in this order, from a television picture to a single transistor. You can leave it at any point and come back.",
    region: "The guided tour",
    of: (n: number) => `of ${n}`,
    back: "Back",
    next: "Next",
    leave: "Leave the tour",
    stops: {
      picture: {
        name: "The picture, slowed down",
        line: "Start with the whole thing: a television picture being drawn, one dot at a time, by the console the engineers rebuilt. Slow it right down and watch the beam travel. Everything else on this page is a part of what you are watching here.",
      },
      wire: {
        name: "The wire",
        line: "The console sends no picture: it sends one wire's worth of voltage, and the television rebuilds the picture from it. Click a line of the frame above, then point at the trace to magnify it down to single dots.",
      },
      colours: {
        name: "The colours",
        line: "Every colour the machine can show is a moment in that wiggle. Pick one and watch the clock: the hue is nothing but timing against the burst, the little reference wave at the start of each line.",
      },
      mario: {
        name: "A real game's frame",
        line: "Now a famous game, measured. The map shows what the processor was doing at each moment of one frame of Super Mario Bros. The grey is the surprise: most of the time it has finished and is waiting.",
      },
      pad: {
        name: "The controller",
        line: "How a button press gets in: eight buttons snapshotted at once, then sent down a single wire a bit at a time. Press a few and watch a read.",
      },
      difference: {
        name: "One button, one frame",
        line: "Two identical consoles, one tap in one of them. This is the engineers' method for finding out what a game does with a button, with no source code at all: run it twice and look for the difference.",
      },
      xray: {
        name: "Your own game",
        line: "The same idea with a cartridge of your own: play for a while, then x-ray a tap. The page replays everything you played twice, differing by that one press, and reports what it changed.",
      },
      sound: {
        name: "The sound",
        line: "Five voices, played by writing numbers into the chip. Turn the sound on and press a key; the pitch shown is measured from the chip's own output, not from what you asked for.",
      },
      slow: {
        name: "The slow chip",
        line: "Now go down a level. This is the picture chip simulated transistor by transistor, drawing the same scene about two thousand times slower than the real thing, and agreeing with the fast version on every dot.",
      },
      die: {
        name: "The die",
        line: "And this is what those transistors are: the chip's own silicon, photographed and traced, with the wires that are carrying a signal lit as it runs. Point at one to learn its name.",
      },
      patterns: {
        name: "The tricks every game uses",
        line: "Games reuse the same handful of tricks, and the engineers are writing them down. Each picture here is one of them, moving: the same ideas you have just watched, drawn as mechanisms.",
      },
      real: {
        name: "Real or model",
        line: "How close is all this to a real NES? Here is the same screen from both, and the one place they still disagree: the model's colours are slightly off, and the engineers know why.",
      },
      museum: {
        name: "The bug museum",
        line: "Nothing this exact gets built without being wrong first. These are the mistakes the engineers kept: what you would have seen, why it happened, and how it was caught.",
      },
      program: {
        name: "Write one yourself",
        line: "Everything a game does is built from instructions like these. Change a line, put it on the chip, and step through it: the same processor family that is inside the console, answering one instruction at a time.",
      },
      bench: {
        name: "The bench",
        line: "Everything you have seen is checked against a real NES on a table, with a board pressing its buttons and cameras watching. Here is the bench itself, photographed by the people who built it.",
      },
      arc: {
        name: "How it was built",
        line: "Finally, the whole thing as days: every plan and report they wrote, from the first sketch to a real console wired to the model. That is where the detail lives, if you want it.",
      },
    },
  },
  time: {
    missing: (reason: string) => `The timeline is drawn from the notebook's own shelves, and this build could not: ${reason}.`,
    date: (month: number, day: number) =>
      `${day} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]}`,
    day: (lane: string, date: string, what: string) => `${lane}, ${date}: ${what}`,
    nothing: "nothing",
    whole: "The whole arc",
    span: (first: string, last: string) => `${first} to ${last}`,
    intro:
      "Every plan and report the engineers wrote, in their own groups, day by day. A darker day is a day with more of them. Pick one to see what was written.",
    noteOne: "A document sits on the first date its own text mentions, which is usually the day the work was done. The one document that carries no date in its text is listed here instead: ",
    noteMany: (n: number) =>
      `A document sits on the first date its own text mentions, which is usually the day the work was done. The ${n} documents that carry no date in their text are listed here instead: `,
  },
  bench: {
    missing: (reason: string) => `The photographs are the engineers', and this build could not read them: ${reason}.`,
    rig: "The whole rig",
    close: "Close up",
    inPicture: "In this picture",
    from: "From ",
    eyes: "What is watching, and what it watches",
  },
  museum: {
    where: "Where the bug lived",
    wall: "The exhibits",
    causes: {
      "the model": "the model",
      "the bench": "the bench",
      "the tools": "the tools",
      "the measuring": "the measuring",
    },
    aBugIn: (cause: string) => `A bug in ${cause}`,
    seen: "What you would have seen",
    why: "Why",
    caught: "How it was caught",
    inWords: "In the engineers' words",
    noPassage: (reason: string) => `This exhibit's passage could not be shown: ${reason}.`,
    whole: "Read the whole account",
    alts: {
      gwmeWrong: "The model's title screen with one wrong tile",
      gwmeRight: "The title screen after the fix",
      roll: "A capture decoded as broadcast television beside the same capture decoded with the NES's own timing",
    },
    plaques: {
      gwme: {
        title: "The title that read GWME",
        seen: "Super Mario Bros.' title screen, perfect except for one letter: the menu offered a 1 PLAYER GWME.",
        why: "Right after counting up, the fast copy of the processor looked at its counter's old value, which was still on its way, so one read went to the wrong address and fetched a W instead of an A. None of the existing tests happened to put those two instructions together.",
        caught: "The engineers traced the wrong letter back to the exact read that fetched it and rebuilt the mistake in a few instructions against the transistor-level chip, which got it right. The first fix broke the menu a new way and was caught the same way; the second came with a set of new tests held to the slow chip.",
      },
      sprites: {
        title: "The sprites that never left",
        seen: "A game froze on its menu, waiting for something that never happened, and a small stray sprite sat on the title screen that no real console showed.",
        why: "When the console copied the sprite table into the picture chip, the model answered from a memo of an earlier read instead of reading memory again, so the first frame's sprites were copied for ever.",
        caught: "The transistor-level chip agreed with the stuck record to the last half-cycle, which cleared the processor. Comparing the memory with what the copy carried named the fault, and a test of two copies in a row now guards it.",
      },
      "wrong-way": {
        title: "Mario ran the wrong way",
        seen: "A recorded game of Mario, replayed on the real console, went off in the wrong direction, and every automatic check stayed quiet.",
        why: "The replay's instructions were sent to the little board faster than it could take them in. Its inbox overflowed and some instructions arrived with digits missing, so buttons were pressed at the wrong moments.",
        caught: "Watching the replay was what caught it. The sender now waits for each line to be read back before sending the next, and a later change made the loading fast again.",
      },
      floating: {
        title: "The counter that counted nothing",
        seen: "Nothing at all. With no console connected, the bench reported that the controller had already been read hundreds of times.",
        why: "The pin that counts the console's controller reads was connected to nothing, so it picked up electrical noise from the room and counted that.",
        caught: "Someone read a status line instead of trusting it. One word in the firmware ties the pin to a steady level when nothing drives it, and the count stays at zero until a console is there.",
      },
      comment: {
        title: "The transistors in a comment",
        seen: "The first count of the picture chip's transistors was too high.",
        why: "The quick count searched the chip's data file for transistor entries, and also counted some the file's author had left inside a comment. A second quick count missed one.",
        caught: "Two real parsers, one of them the reference simulator itself, agreed on the true number, and a test now pins it. The engineers' moral: instruments lie before the code does.",
      },
      roll: {
        title: "The rainbow that rolled",
        seen: "Recordings of a real console decoded with the colours slowly rolling from top to bottom of the picture, invisible on a grey menu and unmissable on World 1-1.",
        why: "The decoder assumed the NES sends an ordinary broadcast TV signal. It does not: its lines are a tiny bit shorter, so the colour timing shifts by a different amount on every line.",
        caught: "A colourful picture made it obvious. The decoder now has a profile for the NES's own timing, and the same recordings decode steady.",
      },
      start: {
        title: "Start that was never ignored",
        seen: "A real console seemed to ignore the Start button after being switched on cold, while taking Select, and a theory about cold boots was written down.",
        why: "The bench's own software kept an old count across a reset, so it pressed Start before the game was ready to look, and the camera caught the menu before the press.",
        caught: "The engineers found the tool at fault, cleared the count on reset, and withdrew the finding in writing, keeping the wrong theory on the page beside the right one.",
      },
      or: {
        title: "The colour that picked up the address",
        seen: "Nothing, in any picture yet. Colours written to the picture chip slowly, one at a time, landed slightly wrong in the transistor model and right in the reference.",
        why: "When nothing was driving a group of wires, the model decided its level one way and the reference simulator another, so the address still lingering on the wires mixed into the colour.",
        caught: "A probe written specially to write colours at different paces found it, because none of the recorded reference runs ever did that. The model now decides those wires the reference's way, and a test fails if it goes back.",
      },
    },
  },
};

type Dict = typeof EN;

const JA: Dict = {
  station: { deeper: "もっと深く: エンジニアたちの記録" },
  machine: {
    names: { pad: "パッド", crystal: "水晶", cart: "カセット", tv: "テレビ" },
    roles: {
      pad: "八つのボタン",
      crystal: "時を刻む",
      cpu: "頭脳と音",
      ppu: "絵のチップ",
      cart: "プログラムと絵札",
      tv: "1 本の線から光へ",
    },
    wires: { buttons: "ボタン", ticks: "刻み", notes: "音", program: "プログラム", tiles: "絵札", sound: "音声", picture: "映像" },
  },
  common: {
    play: "再生",
    pause: "一時停止",
    nextFrame: "次のフレーム",
    cartridge: "カセット",
    yourOwn: "手持ちの .nes",
    waiting: "コンソールを起こしています...",
    none: "·",
    noSlow: "遅いチップはこのビルドに入っていません。scripts/build-playground-wasm.py が、エンジニアたちのチェックアウトから作ります。",
    noDie: "ダイの表示には遅いチップの束が必要で、このビルドには入っていません。",
  },
  hero: {
    paces: {
      real: "実速",
      second: "1 秒に 1 フレーム",
      ten: "10 秒に 1 フレーム",
      minute: "1 分に 1 フレーム",
    },
    howFast: "速さ",
    throughTv: "テレビの信号を通す",
    scrub: "フレームの中でビームがいる位置",
    stage: "コンソールのフレーム。ここを選ぶとキーボードで操作できます。矢印キー、A は X、B は Z、スタートは Enter。",
    field: "ビームが辿るフレーム全体。絵の部分と消えている部分",
    zonePicture: "見えている絵",
    zoneRight: "ビームが左へ戻る",
    zoneBottom: "ビームが上へ戻る。ゲームが絵を書き換える静かな時間",
    cells: {
      line: "走査線",
      dot: "ドット",
      beam: "ビーム",
      time: "フレーム開始から",
      each: "1 ドットの長さ",
      slower: "実機との比",
    },
    beamDrawing: "描いている",
    beamTop: "消灯: 上へ",
    beamLeft: "消灯: 左へ",
    beamFast: "速すぎて見えない",
    carts: {
      bars: {
        name: "カラーバー",
        about: "同じ明るさで全色相。明るさは数秒ごとに変わります。市販のゲームではなく、絵を試すために自分たちで書いたものです。",
      },
      cal: {
        name: "校正カセット",
        about: "実機と模型に映して見比べるための画面が入っています。",
      },
      pad: { name: "パッドの試験カセット", about: "下のボタンを押して、コンソールが気づく様子を見てください。" },
      own: "あなたのディスクからこのブラウザに読み込むだけで、どこにも送られません。読めるのは最も単純な基板のカセットだけで、それ以外は名前を挙げて断られます。",
    },
    pad: "コントローラ",
  },
  wire: {
    line: (n) => `走査線 ${n}`,
    ofFrame: " を、線の上の電圧として。指すと拡大します。",
    trace: (n) => `フレームの走査線 ${n} の電圧波形。同期、カラーバースト、絵の範囲に印をつけたもの`,
    encoding: "フレームを符号化しています...",
    hint: "波形を指すと、その下の数ドットを標本ごとに拡大します。",
    dot: (dot, code, step, hue, samples) =>
      `ドット ${dot}: 色 $${code}、明るさ ${step} 段、色相 ${hue}。1 ドットは線の標本 ${samples} 個ぶんです。`,
    burst: (period, dots) =>
      `カラーバースト。色の拍子を数周期ぶん送り、テレビがそれに時計を合わせます。1 拍は標本 ${period} 個、ドットにして ${dots} 個です。`,
    sync: "同期。線が黒より下に落ち、テレビが新しい行を始めます。",
    blanking: "消灯期間。ビームが消えている間、線は黒のところで休んでいます。",
    bands: { picture: "絵", sync: "同期", burst: "バースト" },
  },
  colours: {
    measuring: "色を測っています...",
    swatches: "コンソールの色。明るさの段と色相で並べたもの",
    swatch: (code) => `色 $${code}`,
    reading: (step, hue) => `明るさ ${step} 段、色相 ${hue}。`,
    grey: "揺れがまったくありません。灰色か黒です。効くのは線の高さだけ。",
    angle: (deg) => `揺れは、バーストから時計回りに ${deg} 度のところにあります。`,
    volts: (mean, swing) => `線は平均 ${mean} V にいて、上下に ${swing} ずつ揺れます。`,
    plot: "上がバーストの 4 拍、下が選んだ色の 4 拍",
    clock: "色相の時計。各色相の揺れをバーストと比べたもの",
    burstLabel: "バースト",
    colourLabel: (code) => `色 $${code}`,
    note: "青緑の針がバースト、テレビの基準です。色のついた針が選んだ色で、角度が色相、長さが線の揺れの強さです。縁の点は、この段で測れた色相すべてです。",
  },
  mario: {
    waiting: "コンソールがフレームの形を返すのを待っています...",
    missing: (reason) => `この地図は解剖の表から描かれますが、このビルドでは読めませんでした: ${reason}。代わりに何も描きません。`,
    map: (frame) => `スーパーマリオブラザーズのフレーム ${frame}。ビームが各点にいるとき CPU が何をしていたかで塗り分けたもの`,
    sweep: "ビームを走らせる",
    scrub: "マリオのフレームの中でビームがいる位置",
    kinds: {
      wait: "ビームを待っている",
      logic: "ゲーム自身の処理",
      busy: "絵のチップ、音、パッドとのやり取り",
      copy: "スプライトの一括転送 (CPU は止まっている)",
      idle: "何もしていない。終わって次のフレーム待ち",
    },
    now: (line, what, ms) => `走査線 ${line}: ${what}。フレーム開始から ${ms} ms。`,
    rowPos: (line, dot) => `走査線 ${line}${dot != null ? `、ドット ${dot}` : ""}`,
    at: " 場所: ",
    fallback: "エンジニアたちの言葉は下にあります。",
    shares: "フレームに占める割合。表の区間からドット単位で数えたもの",
    note: "割合は表自身の走査線とドットからドット単位で数えたもので、ストップウォッチではなく表の時計です。解剖のプロファイラは、待ち時間について自分の数字を持っています。",
  },
  padStation: {
    hold: "押すと押しっぱなしになり、もう一度押すと離します。",
    buttons: "パッドのボタン",
    snapshot: "パッドの中: 写し取られた状態",
    byte: "コンソールの中: 組み上がるバイト",
    watch: "コンソールがパッドを読むところを見る",
    ready: "待機中。",
    latch: "コンソールが掛け金を叩き、パッドが八つのボタンをまとめて写し取ります。",
    tick: (n, name, low) => `${n} 拍目: ${name} が線に出ます。${low ? "押されているので低" : "押されていないので高"}。`,
    done: "完了。1 拍に 1 ビットで、バイトが全部渡りました。実際のゲームは、これを毎フレーム、瞬きより速くやっています。",
    held: "押下",
    names: { a: "A", b: "B", select: "セレクト", start: "スタート", up: "上", down: "下", left: "左", right: "右" },
  },
  tour: {
    start: "案内を始める",
    again: "最初から",
    about: "この順で 20 分ほど。テレビの映像から 1 個のトランジスタまで下りていきます。途中で抜けても、また戻ってこられます。",
    region: "案内",
    of: (n) => `/ ${n}`,
    back: "前へ",
    next: "次へ",
    leave: "案内を抜ける",
    stops: {
      picture: {
        name: "遅くした映像",
        line: "まずは全体から。エンジニアたちが組み直したコンソールが、テレビの映像を 1 ドットずつ描いていきます。うんと遅くして、ビームが進む様子を見てください。このページの他のすべては、ここで見ているものの部分です。",
      },
      wire: {
        name: "線",
        line: "コンソールは映像を送っていません。送っているのは 1 本の線の電圧だけで、テレビがそこから映像を組み直します。上のフレームの走査線を 1 本押し、それから波形を指して 1 ドットまで拡大してみてください。",
      },
      colours: {
        name: "色",
        line: "この機械が出せる色はすべて、あの揺れの中の一瞬です。1 つ選んで時計を見てください。色相とは、各行の頭にある小さな基準の波、バーストとのタイミングの差にすぎません。",
      },
      mario: {
        name: "実際のゲームの 1 フレーム",
        line: "次は有名なゲームを、測ったもの。この地図は、スーパーマリオブラザーズの 1 フレームの各瞬間に CPU が何をしていたかを示します。意外なのは灰色です。ほとんどの時間、仕事を終えて待っています。",
      },
      pad: {
        name: "コントローラ",
        line: "ボタンの押しがどう入るか。八つのボタンをいちどに写し取り、1 本の線で 1 ビットずつ送ります。いくつか押して、読み出しを見てください。",
      },
      difference: {
        name: "ボタン 1 つ、フレーム 1 つ",
        line: "同じコンソールを 2 台、片方だけボタンを 1 回。これは、ソースコードなしでゲームがボタンに何をするか調べる、エンジニアたちのやり方です。2 回走らせて、違いを探します。",
      },
      xray: {
        name: "あなたのゲーム",
        line: "同じ考えを、手持ちのカセットで。しばらく遊んでから、ある 1 押しを透かして見ます。ページは遊んだ通りを 2 回再生し、その 1 押しだけを変えて、何が変わったか報告します。",
      },
      sound: {
        name: "音",
        line: "五つの声を、チップに数を書き込んで鳴らします。音を入れて鍵盤を押してください。出ている高さは、頼んだ値ではなく、チップ自身の出力から測ったものです。",
      },
      slow: {
        name: "遅いチップ",
        line: "ここから一段下ります。これは絵のチップをトランジスタ単位で動かしたもので、同じ場面を実機の 2 千倍ほど遅く描き、速い方とドット単位で一致します。",
      },
      die: {
        name: "ダイ",
        line: "そのトランジスタの正体がこれです。チップ自身のシリコンを撮って写し取ったもので、信号を運んでいる線が動作中に光ります。指すと名前が出ます。",
      },
      patterns: {
        name: "どのゲームも使う手",
        line: "ゲームは同じ数種の手を使い回していて、エンジニアたちはそれを書き留めています。ここの絵はその 1 つずつが動いているもので、いま見てきた考えを仕組みとして描いたものです。",
      },
      real: {
        name: "実機か模型か",
        line: "ここまでのものは、実機の NES にどれだけ近いのか。同じ画面を両方から出したものと、いまも食い違う 1 か所です。模型の色は少しずれていて、エンジニアたちは理由を知っています。",
      },
      museum: {
        name: "バグ博物館",
        line: "これほど精密なものが、一度も間違えずに出来上がることはありません。ここはエンジニアたちが残した失敗です。何が見えたか、なぜ起きたか、どう捕まえたか。",
      },
      program: {
        name: "自分で書いてみる",
        line: "ゲームのすることはすべて、こういう命令から組み上がっています。1 行変えてチップに載せ、1 歩ずつ進めてください。コンソールの中にいるのと同じ系列の CPU が、1 命令ずつ答えます。",
      },
      bench: {
        name: "実験台",
        line: "見てきたものはすべて、台の上の実機の NES に照らして確かめられています。基板がボタンを押し、カメラが見ています。これがその実験台自身を、作った人たちが撮った写真です。",
      },
      arc: {
        name: "作られてきた道筋",
        line: "最後に、全体を日付として。最初の下書きから、模型に繋がれた実機まで、彼らが書いた計画と報告のすべてです。細かいところが要るなら、そこにあります。",
      },
    },
  },
  time: {
    missing: (reason) => `この年表はノートの棚立てから描かれますが、このビルドでは描けませんでした: ${reason}。`,
    date: (month, day) => `${month}月${day}日`,
    day: (lane, date, what) => `${lane}、${date}: ${what}`,
    nothing: "なし",
    whole: "全体の流れ",
    span: (first, last) => `${first}から${last}まで`,
    intro:
      "エンジニアたちが書いた計画と報告のすべてを、彼ら自身の区分けで、日ごとに並べたものです。色の濃い日はそれだけ多く書かれた日です。押すと、その日に何が書かれたか出ます。",
    noteOne: "文書は、その本文が最初に挙げている日付の上に置いています。たいていは作業をした日です。本文に日付を持たない 1 件は、代わりにここに挙げます: ",
    noteMany: (n) => `文書は、その本文が最初に挙げている日付の上に置いています。たいていは作業をした日です。本文に日付を持たない ${n} 件は、代わりにここに挙げます: `,
  },
  bench: {
    missing: (reason) => `写真はエンジニアたちのもので、このビルドでは読めませんでした: ${reason}。`,
    rig: "組み立て全体",
    close: "寄って見る",
    inPicture: "この写真に写っているもの",
    from: "出典: ",
    eyes: "何が見ていて、何を見ているか",
  },
  museum: {
    where: "そのバグがいた場所",
    wall: "展示",
    causes: {
      "the model": "模型",
      "the bench": "実験台",
      "the tools": "道具",
      "the measuring": "測り方",
    },
    aBugIn: (cause) => `${cause}にいたバグ`,
    seen: "見えたはずのもの",
    why: "理由",
    caught: "どう捕まえたか",
    inWords: "エンジニアたちの言葉で",
    noPassage: (reason) => `この展示の引用は出せませんでした: ${reason}。`,
    whole: "全文を読む",
    alts: {
      gwmeWrong: "模型のタイトル画面。絵札が 1 枚だけ違っている",
      gwmeRight: "直したあとのタイトル画面",
      roll: "放送の NTSC として復号した映像と、NES 自身のタイミングで復号した同じ映像",
    },
    plaques: {
      gwme: {
        title: "GWME と出たタイトル",
        seen: "スーパーマリオブラザーズのタイトル画面。1 文字を除いて完璧で、メニューには 1 PLAYER GWME と出ていました。",
        why: "数を足した直後、速い方の CPU の写しが、まだ届いていない古い値の方を見てしまい、読み出しが違う番地に行って A ではなく W を拾いました。当時の試験には、この 2 命令を並べたものが 1 つもありませんでした。",
        caught: "エンジニアたちは、その文字を拾った読み出しまで遡り、数命令に縮めてトランジスタ単位のチップに当てました。そちらは正しく動きました。最初の直しはメニューを別の形で壊し、同じやり方で捕まりました。2 度目の直しには、遅いチップに照らした新しい試験が付いてきました。",
      },
      sprites: {
        title: "居座ったスプライト",
        seen: "あるゲームがメニューで止まり、来ないものを待ち続けました。実機では出ないはずの小さなスプライトが、タイトル画面に 1 つ残っていました。",
        why: "コンソールがスプライトの表を絵のチップへ写すとき、模型はメモリをもう一度読まず、前の読み出しの控えから答えていました。そのため最初のフレームのスプライトが、いつまでも写され続けました。",
        caught: "トランジスタ単位のチップは、止まった記録と半サイクルまで一致し、CPU の疑いは晴れました。メモリと写しの中身を並べて原因が分かり、いまは写しを 2 回続ける試験が見張っています。",
      },
      "wrong-way": {
        title: "マリオが逆に走った",
        seen: "記録したマリオの操作を実機で再生すると、逆の方向へ走っていきました。自動の検査はどれも黙ったままでした。",
        why: "再生の指示が、小さな基板が受け取れるより速く送られていました。受信箱が溢れ、桁の欠けた指示が届いて、ボタンが違う瞬間に押されました。",
        caught: "捕まえたのは、再生を目で見たことでした。送り手はいま 1 行ごとに読み返しを待ってから次を送ります。のちの改良で、読み込みはまた速くなりました。",
      },
      floating: {
        title: "何も数えていなかった計数器",
        seen: "何も起きていないときの話です。コンソールを 1 台も繋いでいないのに、実験台はコントローラがもう何百回も読まれたと報告しました。",
        why: "コンソールのコントローラ読み出しを数える端子が、どこにも繋がっていませんでした。部屋の電気的な雑音を拾い、それを数えていました。",
        caught: "誰かが状態の行を信じずに読みました。ファームウェアの一語で、何も駆動していないときは端子を一定の高さに結び、コンソールが来るまで数は 0 のままになりました。",
      },
      comment: {
        title: "註釈の中のトランジスタ",
        seen: "絵のチップのトランジスタの、最初の数え上げが多すぎました。",
        why: "手早い数え上げがチップのデータファイルを検索し、作者が註釈の中に残していた分まで数えていました。もう一つの手早い数え上げは、逆に 1 つ取りこぼしました。",
        caught: "本物の構文解析器 2 つ、うち 1 つは参照用のシミュレータ自身が、同じ数で一致しました。いまは試験がその数を留めています。エンジニアたちの教訓: 嘘をつくのは、コードより先に計器の方です。",
      },
      roll: {
        title: "流れていった虹",
        seen: "実機の録画を復号すると、色が画面の上から下へゆっくり流れていきました。灰色のメニューでは見えず、ワールド 1-1 では見逃せませんでした。",
        why: "復号する側が、NES は普通の放送用の信号を出していると思っていました。実際は違います。走査線がほんの少し短く、色のタイミングが行ごとに違う量だけずれていきます。",
        caught: "色の多い画面が、一目で分かるようにしてくれました。復号する側は NES 自身のタイミングの設定を持ち、同じ録画が安定して復号できます。",
      },
      start: {
        title: "無視されてなどいなかったスタート",
        seen: "冷えた状態で電源を入れた実機が、セレクトは受け取るのにスタートだけ無視するように見え、冷間起動についての仮説が書き留められました。",
        why: "実験台の側のソフトが、リセットをまたいで古い数を持ち越していました。そのためゲームが見に来る前にスタートを押し、カメラは押す前のメニューを写していました。",
        caught: "エンジニアたちは道具の側の誤りだと突き止め、リセットで数を消し、その所見を文書で取り下げました。誤った仮説は、正しい説明の隣にそのまま残してあります。",
      },
      or: {
        title: "番地を拾った色",
        seen: "いまのところ、どの画面にも何も出ていません。絵のチップへ色をゆっくり 1 つずつ書くと、トランジスタ模型では少しずれた色になり、参照側では正しく入りました。",
        why: "ある一群の線を誰も駆動していないとき、その高さを模型と参照用シミュレータが別々に決めていました。そのため線に残っていた番地が、色に混ざりました。",
        caught: "色を違う速さで書くために書き下ろした探り針が見つけました。記録済みの参照走行には、そんなことをするものが 1 つもなかったからです。模型はいまその線を参照側と同じに決め、戻ると試験が落ちます。",
      },
    },
  },
};

/** The museum's exhibits, and the words on the pictures they hang. */
export type ExhibitKey = keyof typeof EN.museum.plaques;
export type AltKey = keyof typeof EN.museum.alts;

export const UI = { en: EN, ja: JA } as const;

export function ui(lang: Lang): Dict {
  return (UI[lang] ?? UI.en) as Dict;
}
