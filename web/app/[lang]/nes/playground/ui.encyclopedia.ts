import type { Lang } from "@/lib/lang";

/**
 * The encyclopedia station's words, both languages beside each other: the
 * line that says what to watch for in each picture, every label inside
 * the drawings, and the card's own chrome.
 *
 * The pictures are ours, so their words are ours. The entry's name and
 * its "what it does" paragraph are the engineers', read from their
 * encyclopedia at build time, and are never here.
 */

export const EN_ENCYCLOPEDIA = {
  missing: (reason: string) =>
    `The pictures are drawn beside the engineers' encyclopedia, and this build could not read it: ${reason}.`,
  entry: (n: number) => `Entry ${n}`,
  play: "Play",
  pause: "Pause",
  doesH: "What it does, in the entry's words: ",
  readFull: (n: number) => `Read entry ${n} in full`,
  /** One plain sentence per picture: what to watch. No figures. */
  watch: {
    1: "Watch the buttons leave the pad one at a time and walk into a byte of memory, the newest on the left, until the whole pad fits in one number.",
    2: "Watch the order: the picture goes off, then the write. On this kind of cartridge a write is combined with the byte already stored at that spot, so the menu writes somewhere that byte already matches.",
    3: "Watch the main program do nothing, and the whole game happen when the blank taps the processor on the shoulder. On the second frame the game runs long, so the next tap is simply skipped.",
    4: "Watch the top stay put while the level slides under it. The game can only tell when the beam has passed the bar because a sprite is parked there as a marker.",
    5: "Watch the changes pile up while the picture is drawn, and pour into the picture chip only in the blank, the one time it is free to take them.",
    6: "The processor has no instruction for pick one of these and go there, so the game borrows the note a call leaves about where to come back to, and uses it to find the table.",
    7: "Watch the frames tick by. The state decides which routine each frame runs; one press on the ground changes the state, and from the next frame the game is doing something else.",
  } as Record<number, string>,
  poll: {
    alt: "The controller's eight buttons read one at a time into a byte of memory",
    names: ["A", "B", "Sel", "Sta", "Up", "Dn", "Lt", "Rt"],
    held: "in the pad: A and Right held",
    byte: "a byte of memory, filling from the left",
    read: (n: number, of: number, name: string) => `read ${n} of ${of}: ${name}`,
    whole: "the whole pad, one byte",
  },
  bank: {
    alt: "A menu switching banks: the written byte is ANDed with the ROM byte under it, so it writes where the ROM already holds the value",
    cart: "the cartridge",
    menu: "the menu",
    firstGame: "the first game",
    switch: "the switch",
    written: "written",
    romByte: "ROM byte here",
    stores: "so it stores",
    and: "and",
    pictureOff: "picture off",
    pictureOn: "picture on",
    steps: [
      "Start is pressed on the menu",
      "the picture goes off first",
      "the write meets the ROM byte already there",
      "the window swaps to the first game",
      "the game starts from its own beginning",
    ],
  },
  loop: {
    alt: "A frame as a clock face: the main program spins while the interrupt handler, woken at the blank, runs the whole game",
    blank: "the blank",
    main: "main program",
    mainDoes: "jumps to itself, forever",
    handler: "the interrupt handler",
    handlerDoes: "the whole game",
    dropped: "tap ignored: frame dropped",
    busy: "busy: the alarm is off, this tap is skipped",
    long: "a long frame: the handler is still running",
    wakes: "the blank taps the processor: the game wakes",
    works: "the handler works, then goes back to sleep",
    spins: "nothing to do: the main program spins",
  },
  split: {
    alt: "A status bar that stays still while the level scrolls under it, the change made when the beam reaches a marker sprite at the bar's bottom",
    stays: "stays",
    scrolls: "scrolls",
    marker: "marker",
    reached: "the marker is reached: the scroll is set now",
    waiting: "the game waits, watching for the marker sprite",
  },
  buffer: {
    alt: "During the picture the game queues its changes in a list in memory; in the blank the list is poured into the picture chip",
    drawing: "drawing",
    blank: "the blank",
    list: "a list in memory",
    chip: "the picture chip",
    writing: "drawing: the game writes its changes down",
    pouring: "the blank: the list pours into the chip",
  },
  engine: {
    alt: "A jump engine: the return address the call leaves becomes a pointer into the table of routines that follows the call",
    code: "the game's code",
    call: "call the engine",
    routine: (n: number) => `routine ${n}`,
    addressOf: (what: string) => `address of ${what}`,
    note: "the note",
    comeBack: "come back here",
    number: (n: number) => `number: ${n}`,
    jumpTo: (n: number) => `jump to routine ${n}`,
    steps: [
      "the call is made; the table follows it",
      "the call leaves a note of where to come back to",
      "the engine takes the note: it points at the table",
      "it steps down the table by the number given",
      "and jumps to the routine written there",
    ],
  },
  states: {
    alt: "The player's state picks which routine runs each frame; pressing A on the ground changes the state, and the next frame runs a different routine",
    ground: "on the ground",
    air: "in the air",
    pressed: "A pressed",
    landed: "landed",
    running: (air: boolean, sees: boolean) =>
      `${air ? "the in-the-air" : "the on-the-ground"} routine runs${sees ? ", and sees A" : ""}`,
  },
};

export const JA_ENCYCLOPEDIA: typeof EN_ENCYCLOPEDIA = {
  missing: (reason) => `この絵はエンジニアたちの百科事典の隣に描いていますが、このビルドでは読めませんでした: ${reason}。`,
  entry: (n) => `項目 ${n}`,
  play: "動かす",
  pause: "止める",
  doesH: "項目自身の言葉で、何をするものか: ",
  readFull: (n) => `項目 ${n} を全文読む`,
  watch: {
    1: "ボタンがパッドから 1 つずつ出ていき、メモリのバイトへ左から並んでいくのを見てください。最後は、パッド全体が 1 つの数に収まります。",
    2: "順番を見てください。まず絵を消し、それから書き込みます。この種のカセットでは、書き込みがその場所に入っているバイトと組み合わされるので、メニューはそのバイトと元から合う場所に書きます。",
    3: "主なプログラムは何もしません。消灯期間が CPU の肩を叩いた瞬間に、ゲーム全体が起きて動きます。2 つめのフレームではゲームが長引き、次の合図はそのまま飛ばされます。",
    4: "上の帯はそのままで、下の面だけが滑っていきます。ゲームがビームの通過を知る手だては、帯の下端に目印としてスプライトを置いておくことだけです。",
    5: "絵を描いている間は変更が溜まっていき、消灯期間になって初めて絵のチップへ流れ込みます。チップが受け取れるのはそのときだけです。",
    6: "CPU には「この中から 1 つ選んでそこへ行け」という命令がありません。そこでゲームは、呼び出しが残す「戻り先の覚書」を借りて、表の場所を見つけます。",
    7: "フレームが進むのを見てください。どの処理が毎フレーム走るかは状態が決めます。地面で 1 回押すと状態が変わり、次のフレームからは別のことをしています。",
  },
  poll: {
    alt: "コントローラの八つのボタンを 1 つずつ読み、メモリのバイトに入れていく様子",
    names: ["A", "B", "セレ", "スタ", "上", "下", "左", "右"],
    held: "パッドでは A と右を押している",
    byte: "メモリのバイト。左から埋まっていく",
    read: (n, of, name) => `${of} 回のうち ${n} 回目: ${name}`,
    whole: "パッド全体が、1 バイト",
    },
  bank: {
    alt: "メニューが面を切り替える様子。書き込むバイトは、その場所にある ROM のバイトと論理積が取られるので、ROM が元から同じ値を持つ場所へ書く",
    cart: "カセット",
    menu: "メニュー",
    firstGame: "1 本めのゲーム",
    switch: "切り替え",
    written: "書いた値",
    romByte: "ここの ROM のバイト",
    stores: "実際に入る値",
    and: "論理積",
    pictureOff: "絵を消した",
    pictureOn: "絵が出ている",
    steps: [
      "メニューでスタートを押す",
      "まず絵を消す",
      "書き込みが、元からある ROM のバイトと出会う",
      "窓が 1 本めのゲームに入れ替わる",
      "ゲームが自分の頭から始まる",
    ],
  },
  loop: {
    alt: "1 フレームを時計の文字盤として。主なプログラムは空回りし、消灯期間に起こされた割り込みの処理がゲーム全体を動かす",
    blank: "消灯期間",
    main: "主なプログラム",
    mainDoes: "自分へ飛び続けるだけ",
    handler: "割り込みの処理",
    handlerDoes: "ゲーム全体",
    dropped: "合図を無視: このフレームは落ちた",
    busy: "まだ手が離せない: 合図が切れていて、この回は飛ばされる",
    long: "長いフレーム: 処理がまだ走っている",
    wakes: "消灯期間が CPU を叩く: ゲームが起きる",
    works: "処理が働き、また眠りに戻る",
    spins: "することがない: 主なプログラムは空回り",
  },
  split: {
    alt: "上の帯は動かず、その下で面が横に流れる様子。切り替えは、帯の下端に置いた目印のスプライトにビームが届いたときに行う",
    stays: "動かない",
    scrolls: "流れる",
    marker: "目印",
    reached: "目印に届いた: いま横位置を決める",
    waiting: "ゲームは待っている。目印のスプライトを見張りながら",
  },
  buffer: {
    alt: "絵を描いている間、ゲームは変更をメモリの一覧に溜め、消灯期間にその一覧を絵のチップへ流し込む",
    drawing: "描いている",
    blank: "消灯期間",
    list: "メモリの一覧",
    chip: "絵のチップ",
    writing: "描いている間: ゲームは変更を書き留める",
    pouring: "消灯期間: 一覧がチップへ流れ込む",
  },
  engine: {
    alt: "飛び先の仕掛け。呼び出しが残す戻り番地が、その呼び出しの後ろに並ぶ処理の表を指す手がかりになる",
    code: "ゲームのコード",
    call: "仕掛けを呼ぶ",
    routine: (n) => `処理 ${n}`,
    addressOf: (what) => `${what} の番地`,
    note: "覚書",
    comeBack: "ここへ戻れ",
    number: (n) => `番号: ${n}`,
    jumpTo: (n) => `処理 ${n} へ飛ぶ`,
    steps: [
      "呼び出しが行われる。表はその後ろに並んでいる",
      "呼び出しが、戻り先の覚書を残す",
      "仕掛けがその覚書を取る: それが表を指している",
      "渡された番号のぶん、表を下へ辿る",
      "そこに書かれた処理へ飛ぶ",
    ],
  },
  states: {
    alt: "遊び手の状態が、毎フレームどの処理を走らせるかを決める。地面で A を押すと状態が変わり、次のフレームからは別の処理が走る",
    ground: "地面にいる",
    air: "空中にいる",
    pressed: "A を押した",
    landed: "着地した",
    running: (air, sees) => `${air ? "空中の" : "地面の"}処理が走る${sees ? "。そして A を見る" : ""}`,
  },
};

export type EncyclopediaWords = typeof EN_ENCYCLOPEDIA;

export function encyclopediaWords(lang: Lang) {
  return lang === "ja" ? JA_ENCYCLOPEDIA : EN_ENCYCLOPEDIA;
}
