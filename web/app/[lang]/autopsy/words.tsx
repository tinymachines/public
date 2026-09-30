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
  "game-loop-in-nmi",
  "jump-engine",
  "bank-switch",
  "vram-drain",
  "palette-writer",
  "sprite-writer",
  "scroll-writer",
  "sprite-0-split",
  "sound-driver",
  "random-byte",
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
  "game-loop-in-nmi": {
    en: { name: "The game inside the interrupt", what: "When the main program only spins, the whole game runs in the handler of the interrupt the picture chip raises once a frame. We name that handler when there is an idle spin and the handler ran in at least half the frames." },
    ja: { name: "割り込みの中のゲーム", what: "メインのプログラムが待つだけのとき、ゲームのすべては、映像チップがフレームごとに一度起こす割り込みのハンドラの中で走る。待機のループがあり、ハンドラがフレームの半分以上で走ったとき、そのハンドラをこう名付ける。" },
  },
  "jump-engine": {
    en: { name: "The jump engine", what: "A routine other code calls to choose where to go next. The call is followed by a table of addresses, and the engine jumps through it by a number. We name it as the routine those calls reach, and write each table down as far as the runs saw entries taken." },
    ja: { name: "ジャンプエンジン", what: "次にどこへ行くかを選ぶために、ほかのコードが呼ぶルーチン。呼び出しの直後にアドレスのテーブルが続き、エンジンは番号でそこを通って跳ぶ。そうした呼び出しが届くルーチンとして名付け、それぞれのテーブルは、走行が項目を選ぶのを見た範囲まで書き出す。" },
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
  "random-byte": {
    en: { name: "The random byte", what: "Memory that a routine rewrites from itself every frame, with a rotate on the byte and an exclusive-or somewhere in the same routine. These are the game's dice." },
    ja: { name: "乱数のバイト", what: "ルーチンが毎フレーム、自分自身から書き直すメモリ。そのバイトへの回転と、同じルーチンのどこかにある排他的論理和を伴う。ゲームのさいころだ。" },
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
  dispatches: { en: "jumps through them", ja: "そこを通った跳躍" },
  iterations: { en: "turns", ja: "周回" },
  "per-frame": { en: "turns a frame", ja: "一フレームの周回" },
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
  for (const [k, v] of Object.entries(evidence)) {
    if (k === "by") continue; // who found it: the matchers, on every row
    const label = EVIDENCE[k];
    if (!label) throw new Error(`app/[lang]/autopsy/words.tsx has no label for the evidence ${JSON.stringify(k)}`);
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
