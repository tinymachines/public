import type { Lang } from "@/lib/lang";

/**
 * Spot the difference: its controls, its fixed cells and the short lines
 * it prints, both languages beside each other.
 *
 * The engineers' own words are not here. Their x-ray's steps, their code
 * and their two Mario taps are read from their documents and shown as
 * they wrote them; what this file holds is the plain sentence beside
 * each one.
 *
 * A reading that is a figure stays a figure: only its label and its
 * words are translated.
 */

export const EN_TWINS = {
  carts: {
    cal: "The calibration cartridge",
    bars: "Colour bars",
    pad: "The pad tester",
  },
  paces: {
    two: "Two frames a second",
    ten: "Ten frames a second",
    real: "Real speed",
  },
  cells: {
    frame: "Frame",
    since: "Frames since the tap",
    now: "Dots apart now",
    most: "Most dots apart",
    first: "First apart at frame",
    again: "Together again at frame",
  },
  notYet: "not yet",
  fields: {
    pad: "the buttons",
    parity: "check bit",
  },
  panels: {
    left: "Left: no tap",
    right: "Right: the same, plus one tap",
    where: "Where they differ, fading",
    leftPicture: "The left console's picture",
    rightPicture: "The right console's picture",
    wherePicture: "Every dot on which the two pictures differ, lit, fading over a second",
  },
  tapLabel: "Tap",
  tapIt: "Tap it in the right console only",
  play: "Play",
  pause: "Pause",
  nextFrame: "Next frame",
  howFast: "How fast",
  apartHeading: "Dots apart, frame by frame (the red mark is the tap)",
  apartTrace: "How many dots the two pictures differ by on each of the last frames",
  cartridge: "Cartridge",
  yourOwn: "Your own .nes",
  holdBoth: "Hold for both",
  note: "Buttons held here go to both consoles. With your own game, hold Right to walk, then tap A in mid-air, and again on the ground, and watch how long the difference lasts.",
  bit: {
    missing: (reason: string) => `The engineers' x-ray is read from their encyclopedia, and this build could not: ${reason}.`,
    heading: "Follow the bit",
    headingRest: " through the engineers' x-ray of one tap on their pad cartridge",
    back: "Back",
    next: "Next step",
    step: (n: number, of: number) => `Step ${n} of ${of}`,
    byte: "The byte in memory the bit walks through",
    code: "The cartridge's poll routine, the lines on the tap's path marked",
    echoMark: "(echo) ",
    at: " at ",
    elided: "The report shortens the middle of the walk here, in its own words:",
    steps: {
      echo: "An echo, a frame later: the next read of the controller rotates the old bit out of the byte.",
      read: "The processor reads the controller. This read is where the tap gets in: the only door a button has.",
      rotate: "The bit moves one place along a byte of memory, as each button is read in turn.",
      load: "The processor reads the finished byte back out of memory.",
      store: "And writes it into the picture chip, as a colour: the tap is on the screen.",
    },
  },
  mario: {
    missing: (reason: string) => `The Mario taps are read from the dissection, and this build could not: ${reason}.`,
    heading: "The same experiment on Super Mario Bros.",
    headingRest: " the engineers' two taps, from their dissection",
    air: "A tap in mid-air",
    ground: "A tap on the ground",
    airPlain: "The game ignored it. After a few frames the two runs were the same again.",
    groundPlain: "Mario jumped, and the two runs never came back together: one button, one frame, a different game from then on.",
    fallback: "Read the engineers' account.",
  },
};

export const JA_TWINS: typeof EN_TWINS = {
  carts: {
    cal: "校正カセット",
    bars: "カラーバー",
    pad: "パッドの試験カセット",
  },
  paces: {
    two: "1 秒に 2 フレーム",
    ten: "1 秒に 10 フレーム",
    real: "実速",
  },
  cells: {
    frame: "フレーム",
    since: "叩いてからのフレーム数",
    now: "いま違うドット数",
    most: "いちばん違ったドット数",
    first: "最初に違ったフレーム",
    again: "また一致したフレーム",
  },
  notYet: "まだ",
  fields: {
    pad: "ボタン",
    parity: "検査ビット",
  },
  panels: {
    left: "左: 叩かない方",
    right: "右: 同じもので、1 回だけ叩く",
    where: "違っているところ。だんだん薄れます",
    leftPicture: "左のコンソールの映像",
    rightPicture: "右のコンソールの映像",
    wherePicture: "2 つの映像が違っているドットを光らせたもの。1 秒ほどかけて薄れます",
  },
  tapLabel: "叩くボタン",
  tapIt: "右のコンソールだけで叩く",
  play: "再生",
  pause: "一時停止",
  nextFrame: "次のフレーム",
  howFast: "速さ",
  apartHeading: "違ったドット数、フレームごと (赤い印が叩いた瞬間)",
  apartTrace: "直近のフレームごとに、2 つの映像が何ドット違っていたか",
  cartridge: "カセット",
  yourOwn: "手持ちの .nes",
  holdBoth: "両方で押しっぱなし",
  note: "ここで押したボタンは両方のコンソールに行きます。手持ちのゲームなら、右を押して歩かせ、空中で A を叩き、それから地面でもう一度叩いて、違いがどれだけ続くか見てください。",
  bit: {
    missing: (reason) => `エンジニアたちの透視は彼らの百科から読みますが、このビルドでは読めませんでした: ${reason}。`,
    heading: "ビットを追う",
    headingRest: " エンジニアたちがパッド用カセットの 1 押しを透かして見た記録に沿って",
    back: "前へ",
    next: "次の段",
    step: (n, of) => `${of} 段のうち ${n} 段目`,
    byte: "ビットが通っていくメモリのバイト",
    code: "カセットの読み取りルーチン。押しが通る行に印をつけたもの",
    echoMark: "(反響) ",
    at: " 場所: ",
    elided: "報告はここで歩みの途中を縮めています。彼ら自身の言葉で:",
    steps: {
      echo: "1 フレームあとの反響です。次にコントローラを読むと、古いビットがバイトから回り出ます。",
      read: "CPU がコントローラを読みます。押しが入るのはこの読み出しで、ボタンにとって唯一の入口です。",
      rotate: "ボタンが順に読まれるにつれ、ビットがメモリのバイトの中を 1 つずつ進みます。",
      load: "CPU が、出来上がったバイトをメモリから読み返します。",
      store: "そしてそれを色として絵のチップに書き込みます。押しが画面に出ました。",
    },
  },
  mario: {
    missing: (reason) => `マリオの押しは解剖から読みますが、このビルドでは読めませんでした: ${reason}。`,
    heading: "同じ実験をスーパーマリオブラザーズで",
    headingRest: " エンジニアたちの 2 回の押し、彼らの解剖から",
    air: "空中で 1 回",
    ground: "地面で 1 回",
    airPlain: "ゲームは受け取りませんでした。数フレームで、2 つの走行はまた同じになりました。",
    groundPlain: "マリオは跳び、2 つの走行は二度と戻りませんでした。ボタン 1 つ、フレーム 1 つで、そこから先は別のゲームです。",
    fallback: "エンジニアたちの記述を読んでください。",
  },
};

export function twinsWords(lang: Lang) {
  return lang === "ja" ? JA_TWINS : EN_TWINS;
}
