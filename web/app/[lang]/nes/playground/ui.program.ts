import type { Lang } from "@/lib/lang";

/**
 * The write-a-program station's words, both languages beside each other:
 * its buttons, its fixed cells, the four examples, and the plain line
 * beside each instruction.
 *
 * The chip's own answers are never here. The assembling, the registers,
 * the memory and every refusal come from the service and are shown as it
 * words them; the source of each example is code, so it stays as typed.
 */

export const EN_PROGRAM = {
  yourProgram: "Your program",
  put: "Put it on the chip",
  oneInstruction: "One instruction",
  stop: "Stop",
  run: "Run it",
  tryOne: "Try one",
  given: "What the chip was given",
  pressPut: "Press “Put it on the chip” and the assembled program appears here, with what each line does.",
  answered: (status: number) => `the chip answered ${status}`,
  cells: {
    a: "A, the working register",
    x: "X",
    y: "Y",
    pc: "Where it is",
    flags: "Flags",
    ran: "Instructions run",
  },
  page: "The first page of memory, as the program leaves it",
  pageAria: "The first 256 bytes of memory",
  examples: {
    keep: {
      name: "Keep a number",
      why: "The smallest program there is: put a number in the processor, then put it somewhere in memory.",
    },
    add: {
      name: "Add two numbers",
      why: "The processor adds with whatever it is carrying from the last sum, so the first thing to do is clear that.",
    },
    count: {
      name: "Count to ten",
      why: "A loop: count up, compare, and go back if you are not there yet. Every game's main loop is this shape.",
    },
    fill: {
      name: "Fill a row of memory",
      why: "The same loop, writing as it goes: eight bytes of memory filled with the same value.",
    },
  },
  gloss: {
    LDA: "put this number into A, the main working register",
    LDX: "put this number into X, a counting register",
    LDY: "put this number into Y, the other counting register",
    STA: "copy A into memory here",
    STX: "copy X into memory here",
    STY: "copy Y into memory here",
    INX: "add one to X",
    INY: "add one to Y",
    DEX: "take one away from X",
    DEY: "take one away from Y",
    CLC: "clear the carry: start an addition cleanly",
    ADC: "add this number to A",
    SBC: "subtract this number from A",
    CMP: "compare A with this number",
    CPX: "compare X with this number",
    CPY: "compare Y with this number",
    BNE: "if that comparison was not equal, go back to the label",
    BEQ: "if that comparison was equal, jump to the label",
    JMP: "go to this place and carry on from there",
    BRK: "stop",
    NOP: "do nothing for a moment",
  } as Record<string, string>,
};

export const JA_PROGRAM: typeof EN_PROGRAM = {
  yourProgram: "あなたのプログラム",
  put: "チップに載せる",
  oneInstruction: "1 命令だけ",
  stop: "止める",
  run: "走らせる",
  tryOne: "試してみる",
  given: "チップに渡されたもの",
  pressPut: "「チップに載せる」を押すと、組み上がったプログラムがここに出ます。各行が何をするかも一緒に。",
  answered: (status) => `チップが ${status} を返しました`,
  cells: {
    a: "A、主な作業レジスタ",
    x: "X",
    y: "Y",
    pc: "いまいる場所",
    flags: "フラグ",
    ran: "走った命令の数",
  },
  page: "プログラムが残したあとの、メモリの最初のページ",
  pageAria: "メモリの最初の 256 バイト",
  examples: {
    keep: {
      name: "数を 1 つ置く",
      why: "これより小さいプログラムはありません。数を CPU に入れ、それをメモリのどこかに置きます。",
    },
    add: {
      name: "2 つの数を足す",
      why: "CPU は前の足し算から持ち越した分も一緒に足すので、まずそれを消します。",
    },
    count: {
      name: "10 まで数える",
      why: "繰り返し。数を足し、比べ、まだなら戻る。どのゲームの主な繰り返しも、この形です。",
    },
    fill: {
      name: "メモリを 1 列埋める",
      why: "同じ繰り返しで、進みながら書きます。メモリ 8 バイトを同じ値で埋めます。",
    },
  },
  gloss: {
    LDA: "この数を A、主な作業レジスタに入れる",
    LDX: "この数を X、数を数えるレジスタに入れる",
    LDY: "この数を Y、もう一つの数を数えるレジスタに入れる",
    STA: "A をここのメモリに写す",
    STX: "X をここのメモリに写す",
    STY: "Y をここのメモリに写す",
    INX: "X に 1 を足す",
    INY: "Y に 1 を足す",
    DEX: "X から 1 を引く",
    DEY: "Y から 1 を引く",
    CLC: "繰り上がりを消す: 足し算をきれいに始める",
    ADC: "この数を A に足す",
    SBC: "この数を A から引く",
    CMP: "A とこの数を比べる",
    CPX: "X とこの数を比べる",
    CPY: "Y とこの数を比べる",
    BNE: "さきの比較が等しくなければ、ラベルへ戻る",
    BEQ: "さきの比較が等しければ、ラベルへ飛ぶ",
    JMP: "ここへ行って、そこから続ける",
    BRK: "止まる",
    NOP: "少しのあいだ何もしない",
  },
};

export function programWords(lang: Lang) {
  return lang === "ja" ? JA_PROGRAM : EN_PROGRAM;
}
