import type { Lang } from "@/lib/lang";

/**
 * The words the autopsy's pages share, in both languages: what each
 * pattern is called and how we tell it, what each piece of evidence means,
 * and how a routine was entered. The rules themselves live in one place,
 * wasm/listing (FORMAT.md, "What the matchers write"); these sentences say
 * them to a reader. A pattern the record holds and this table does not is
 * a build failure, not a row with no name.
 */

/** The order the patterns are told in: what a game must do first. */
export const ORDER = [
  "pad-poll",
  "idle-spin",
  "counting-spin",
  "game-loop-in-nmi",
  "frame-wait",
  "jump-engine",
  "handler-in-memory",
  "bank-switch",
  "vram-drain",
  "palette-writer",
  "sprite-writer",
  "scroll-writer",
  "sprite-0-split",
  "sound-driver",
  "random-byte",
  "position-compare",
] as const;

const PATTERNS: Record<string, Record<Lang, { name: string; what: string }>> = {
  "pad-poll": {
    en: { name: "The poll", what: "The routine that reads the controller. We name it by what it did: it read the pad's port at least eight times, once for each button, in every frame it ran." },
    ja: { name: "パッドの読み取り", what: "コントローラを読むルーチン。したことで名付ける: 走ったフレームごとに、パッドのポートをボタン一つにつき一回、少なくとも八回読んだ。" },
  },
  "idle-spin": {
    en: { name: "The idle spin", what: "One instruction that jumps to itself. The main program has nothing to do until the next frame, and this is where it waits." },
    ja: { name: "待機のループ", what: "自分自身へ跳ぶ一つの命令。メインのプログラムは次のフレームまですることが無く、ここで待つ。" },
  },
  "counting-spin": {
    en: { name: "The counting spin", what: "A few instructions in a circle with no way out, that do nothing but change one byte of memory. The main program sits here between frames, as it does in an idle spin, and the byte is as good as a random number to anything that reads it, because how far it got depends on how long the frame's work took." },
    ja: { name: "数える待機ループ", what: "出口の無い輪になった数個の命令で、メモリの一バイトを変えることしかしない。待機のループと同じく、メインのプログラムはフレームの間ここに居る。そのバイトは、読む側にとっては乱数も同然だ。どこまで進んだかは、そのフレームの仕事にかかった時間で決まるからだ。" },
  },
  "game-loop-in-nmi": {
    en: { name: "The game inside the interrupt", what: "When the main program only spins, the whole game runs in the handler of the interrupt the picture chip raises once a frame. We name that handler when there is an idle spin or a counting spin and the handler ran in at least half the frames." },
    ja: { name: "割り込みの中のゲーム", what: "メインのプログラムが待つだけのとき、ゲームのすべては、映像チップがフレームごとに一度起こす割り込みのハンドラの中で走る。待機のループか数える待機ループがあり、ハンドラがフレームの半分以上で走ったとき、そのハンドラをこう名付ける。" },
  },
  "frame-wait": {
    en: { name: "The wait for the frame", what: "A loop that only reads a byte of memory and tests it, over and over. Nothing in the loop can change that byte, so the game stays there until the interrupt the picture chip raises once a frame changes it. We name the loop when that interrupt's handler, or a routine the handler calls, wrote the byte. A game may wait like this in several places, on a flag or on a counter the handler runs down, and some do a small chore on each turn of the wait." },
    ja: { name: "フレーム待ち", what: "メモリの一バイトを読んで調べることだけを繰り返すループ。ループの中の何ものもそのバイトを変えられないので、映像チップがフレームごとに一度起こす割り込みがそれを変えるまで、ゲームはそこに留まる。その割り込みのハンドラ、またはハンドラが呼ぶルーチンがそのバイトに書いたとき、ループをこう名付ける。ゲームはこうした待ちを何か所にも持つことがあり、待つ相手は旗のこともあれば、ハンドラが減らしていくカウンタのこともある。待ちの一周ごとに小さな用事を済ませるゲームもある。" },
  },
  "jump-engine": {
    en: { name: "The jump engine", what: "A routine other code calls to choose where to go next. The call is followed by a table of addresses, and the engine jumps through it by a number. We name it as the routine those calls reach, and write each table down as far as the runs saw entries taken." },
    ja: { name: "ジャンプエンジン", what: "次にどこへ行くかを選ぶために、ほかのコードが呼ぶルーチン。呼び出しの直後にアドレスのテーブルが続き、エンジンは番号でそこを通って跳ぶ。そうした呼び出しが届くルーチンとして名付け、それぞれのテーブルは、走行が項目を選ぶのを見た範囲まで書き出す。" },
  },
  "handler-in-memory": {
    en: { name: "The handler kept in memory", what: "A routine that jumps through an address it copied out of memory, where a jump engine would look one up in the cartridge. Each thing on the screen keeps the address of its own code beside its position, and this routine runs them in turn. We follow the address back to the bytes it was copied from." },
    ja: { name: "メモリに置かれたハンドラ", what: "メモリから写したアドレスを通って跳ぶルーチン。ジャンプエンジンならカートリッジの中で引くところだ。画面上のものそれぞれが、自分のコードのアドレスを位置の隣に持っていて、このルーチンがそれらを順に走らせる。アドレスは、写された元のバイトまでたどる。" },
  },
  "bank-switch": {
    en: { name: "The bank switch", what: "A routine that wrote into the cartridge's own address range. On a board with a register there, that write selects which part of the program the console sees." },
    ja: { name: "バンク切り替え", what: "カートリッジ自身のアドレス範囲へ書き込んだルーチン。そこにレジスタを持つ基板では、その書き込みが、コンソールに見えるプログラムの部分を選ぶ。" },
  },
  "vram-drain": {
    en: { name: "The picture writer", what: "Of the routines that wrote picture memory, the one that wrote the most among those that ran in most frames. The evidence says how many of its writes fell in the blank between pictures and how many while one was drawing." },
    ja: { name: "画面メモリへの書き手", what: "画面メモリへ書いたルーチンのうち、ほとんどのフレームで走ったものの中で最も多く書いたもの。証拠は、その書き込みのうち絵と絵の間のブランクに入った数と、描画中に入った数を言う。" },
  },
  "palette-writer": {
    en: { name: "The palette writers", what: "Routines that wrote picture memory while its address pointed into the palette. We follow the address the game sets, so each write lands somewhere." },
    ja: { name: "パレットの書き手", what: "画面メモリのアドレスがパレットを指している間に書き込んだルーチン。ゲームが設定するアドレスを追うので、どの書き込みもどこかに着地する。" },
  },
  "sprite-writer": {
    en: { name: "The sprite writers", what: "Routines that wrote into the page of memory the console copies to the sprite table every frame. These are the routines that put things on the screen that move." },
    ja: { name: "スプライトの書き手", what: "コンソールが毎フレーム、スプライトの表へ写すメモリのページに書き込んだルーチン。動くものを画面に置くのはこれらのルーチンだ。" },
  },
  "scroll-writer": {
    en: { name: "The scroll writer", what: "A routine that set the scroll in the blank, in every frame it ran." },
    ja: { name: "スクロールの書き手", what: "走ったすべてのフレームで、ブランクの間にスクロールを設定したルーチン。" },
  },
  "sprite-0-split": {
    en: { name: "The split", what: "A routine that watches the picture chip's status while the picture is drawing, many times a frame, and then moves the scroll there. That is how a status bar holds still above a field that scrolls." },
    ja: { name: "画面の分割", what: "絵が描かれている間に映像チップのステータスを一フレームに何度も見張り、それからそこでスクロールを動かすルーチン。スクロールする画面の上でステータスバーが止まっていられるのは、このためだ。" },
  },
  "sound-driver": {
    en: { name: "The sound driver", what: "Of the routines that wrote the sound chip's registers, the one that wrote the most among those that ran in most frames." },
    ja: { name: "サウンドドライバ", what: "音源チップのレジスタへ書いたルーチンのうち、ほとんどのフレームで走ったものの中で最も多く書いたもの。" },
  },
  "position-compare": {
    en: { name: "Where two things are compared", what: "A routine that compares or subtracts the positions of two different things on the screen. We follow each value from the byte of memory it was loaded from, through whatever the game copies it into, to see which bytes end up as a sprite's position; then we name the routine where two of those bytes meet. That is the heart of a collision test. It is also how an enemy finds which side the player is on, and how a game sorts what it draws by depth, and the rule does not tell these apart." },
    ja: { name: "二つのものを比べる所", what: "画面上の別々の二つのものの位置を、比べるか引き算するルーチン。それぞれの値を、読み込まれた元のメモリのバイトから、ゲームが写していく先々を通して追い、どのバイトがスプライトの位置になるかを見る。そのうえで、そうしたバイトの二つが出会うルーチンを名付ける。当たり判定の心臓部だ。敵がプレイヤーはどちら側かを知る方法でもあり、ゲームが描くものを奥行きの順に並べる方法でもある。この規則はそれらを区別しない。" },
  },
  "random-byte": {
    en: { name: "The random byte", what: "Memory that a routine rewrites from itself, with a rotate on the byte and an exclusive-or in the same routine, where the routine also looks at the old value and the byte keeps its value from one frame to the next. These are the game's dice." },
    ja: { name: "乱数のバイト", what: "ルーチンが自分自身から書き直すメモリ。そのバイトへの回転と、同じルーチンの中の排他的論理和を伴い、ルーチンは古い値も見て、バイトはフレームからフレームへ値を保つ。ゲームのさいころだ。" },
  },
};

export function patternWords(lang: Lang, key: string): { name: string; what: string } {
  const w = PATTERNS[key];
  if (!w) throw new Error(`app/[lang]/autopsy/words.tsx has no words for the pattern ${JSON.stringify(key)}; the record holds it, so the page must name it`);
  return w[lang];
}

const EVIDENCE: Record<string, Record<Lang, string>> = {
  port: { en: "port", ja: "ポート" },
  "reads-per-frame": { en: "reads a frame", ja: "一フレームの読み" },
  "strobes-per-frame": { en: "strobes a frame", ja: "一フレームのストローブ" },
  tables: { en: "tables", ja: "テーブル" },
  jumps: { en: "jumps", ja: "跳躍" },
  targets: { en: "places it landed", ja: "着地した場所" },
  from: { en: "address copied from", ja: "アドレスの写し元" },
  dispatches: { en: "jumps through them", ja: "そこを通った跳躍" },
  flag: { en: "waits on the byte at", ja: "待つ相手のバイト" },
  byte: { en: "counts in the byte at", ja: "数えるバイト" },
  sites: { en: "instructions", ja: "命令" },
  pairs: { en: "pairs of bytes", ja: "バイトの組" },
  cells: { en: "bytes in all", ja: "バイトの総数" },
  meets: { en: "times compared", ja: "比べた回数" },
  x: { en: "X positions at", ja: "横の位置のバイト" },
  y: { en: "Y positions at", ja: "縦の位置のバイト" },
  entries: { en: "times entered", ja: "入った回数" },
  iterations: { en: "turns", ja: "周回" },
  "per-frame": { en: "turns a frame", ja: "一フレームの周回" },
  "read-elsewhere": { en: "reads of it from outside the loop", ja: "ループの外からの読み" },
  calls: { en: "calls on each turn", ja: "一周ごとの呼び出し" },
  "set-in-nmi": { en: "writes of it under the frame interrupt", ja: "フレーム割り込みの下での書き込み" },
  frames: { en: "frames it ran in", ja: "走ったフレーム" },
  of: { en: "frames in all", ja: "全フレーム" },
  spin: { en: "the spin is at", ja: "待機の場所" },
  writes: { en: "writes", ja: "書き込み" },
  "in-blank": { en: "in the blank", ja: "ブランク中" },
  "in-picture": { en: "while drawing", ja: "描画中" },
  "scroll-writes-in-picture": { en: "scroll writes while drawing", ja: "描画中のスクロール書き込み" },
  "status-reads-in-picture": { en: "status reads while drawing", ja: "描画中のステータス読み" },
  "oam-writes": { en: "writes to the sprite page", ja: "スプライトのページへの書き込み" },
  bytes: { en: "bytes", ja: "バイト" },
  shifts: { en: "rotates", ja: "回転" },
  eors: { en: "exclusive-ors", ja: "排他的論理和" },
  "writes-in-blank": { en: "writes in the blank", ja: "ブランク中の書き込み" },
};

/** One pattern's evidence as a reader's line: every measured thing with its label. */
export function evidenceText(lang: Lang, evidence: Record<string, number | string>): string {
  const parts: string[] = [];
  for (const k of Object.keys(evidence)) {
    // "by" is who found it: the matchers, on every row.
    if (k !== "by" && !EVIDENCE[k]) throw new Error(`app/[lang]/autopsy/words.tsx has no label for the evidence ${JSON.stringify(k)}`);
  }
  // In the order the labels are written above, so a line reads as a
  // sentence would ("tables 5, jumps through them 16,167") whatever order
  // the record's keys came in.
  for (const [k, label] of Object.entries(EVIDENCE)) {
    const v = evidence[k];
    if (v === undefined) continue;
    parts.push(`${label[lang]} ${typeof v === "number" ? v.toLocaleString(lang) : v}`);
  }
  return parts.join(lang === "ja" ? "、" : ", ");
}

const KINDS: Record<string, Record<Lang, string>> = {
  reset: { en: "power-on", ja: "電源投入" },
  nmi: { en: "each frame (NMI)", ja: "毎フレーム（NMI）" },
  irq: { en: "an interrupt (IRQ)", ja: "割り込み（IRQ）" },
  brk: { en: "BRK", ja: "BRK" },
  call: { en: "a call", ja: "呼び出し" },
  dispatch: { en: "a table", ja: "テーブル" },
};

export function kindWords(lang: Lang, kind: string): string {
  return KINDS[kind]?.[lang] ?? kind;
}

export const hex4 = (n: number) => `$${n.toString(16).toUpperCase().padStart(4, "0")}`;
