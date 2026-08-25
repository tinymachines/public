import type { Lang } from "@/lib/lang";

/** The lesson's copy, both languages, read by /6502 and /6502/learn. */
export const LESSON = {
  en: {
    eyebrow: "The lesson",
    lede: (
      <>
        Everything on this page runs on a transistor-level MOS 6502: not a
        model of one, the die itself, simulated switch by switch. The fastest
        way in is to make it run something of yours.
      </>
    ),
    ctaToken: "Mint a free token",
    ctaBuild: "Build a cart with your AI tool",
    ctaWalk: "Read the walk",
    steps: [
      {
        n: "1",
        title: "Mint a free token",
        body: "A token is your handle in the registry and your key to the chip API. Mint one in the editor: free, one click, shown once. It is yours to claim a handle with and publish under.",
        href: "/6502/manage#mint",
        link: "Mint one in the editor",
      },
      {
        n: "2",
        title: "Build a cartridge",
        body: "A cartridge is a ROM, its tiles and the contract it was written to, in one file. Write it by hand against the console contract, or hand the contract to the AI tool you already use: the MCP server gives it five tools, each a whole errand.",
        href: "/docs/6502/mcp",
        link: "MCP: five tools for a model",
        more: [
          { href: "/docs/6502/cartridges", label: "Cartridges" },
          { href: "/docs/6502/the-console-contract", label: "The console contract" },
          { href: "/docs/6502/two-ways-in", label: "Two ways in: page or HTTP" },
        ],
      },
      {
        n: "3",
        title: "Publish it, and the chip measures it",
        body: "Publishing does not upload a claim. The registry runs your cartridge on the die before it is listed, and what it shows beside your ROM is what the chip did: whether it booted, how many frames it finished, the half-cycles each one cost, the tiles it used.",
        href: "/6502/builders",
        link: "What others have published",
      },
      {
        n: "4",
        title: "Then follow one instruction into the silicon",
        body: "The walk takes one Snake instruction five cycles deep, with the schematics pulled live from the switch network. It is the lesson the whole site is set up to teach: how a line of code becomes gates opening.",
        href: "/docs/6502/walk-snake",
        link: "Snake, one instruction deep",
      },
    ],
    instruments: "The instruments",
    instrumentsLede: "Every view is the same chip, lit by what it is doing. Grouped the way the explorer groups them.",
    places: "Places",
    placesLede: "The rest of the project, each one a page here.",
    reading: "Reading",
    readingLede: "The documentation for this project, in the order it is meant to be read.",
    parts: "Where each part answers",
    thPart: "Part",
    thWhat: "What it is",
    thToday: "Answers today",
    thLands: "Lands at",
    thStatus: "Status",
    proposed: "proposed",
  },
  ja: {
    eyebrow: "レッスン",
    lede: (
      <>
        このページにあるものはすべて、トランジスタレベルの MOS 6502
        の上で動く。モデルではなく、ダイそのものをスイッチ単位でシミュレート
        したものだ。いちばん早い入り方は、自分の書いたものをそこで走らせることだ。
      </>
    ),
    ctaToken: "無料のトークンを鋳造",
    ctaBuild: "AI ツールでカートを作る",
    ctaWalk: "ウォークを読む",
    steps: [
      {
        n: "1",
        title: "無料のトークンを鋳造する",
        body: "トークンはレジストリでのあなたのハンドルであり、チップ API への鍵だ。エディタで鋳造する: 無料、ワンクリック、表示は一度きり。それでハンドルを取得し、その名で公開する。",
        href: "/6502/manage#mint",
        link: "エディタで鋳造する",
      },
      {
        n: "2",
        title: "カートリッジを作る",
        body: "カートリッジは、ROM とタイルと、それが書かれた規約を一つのファイルにしたものだ。コンソール規約に沿って手で書くか、その規約をいつも使っている AI ツールに渡す: MCP サーバはモデルに五つの道具を与え、それぞれが一仕事を丸ごと担う。",
        href: "/docs/6502/mcp",
        link: "MCP: モデルのための五つの道具",
        more: [
          { href: "/docs/6502/cartridges", label: "カートリッジ" },
          { href: "/docs/6502/the-console-contract", label: "コンソール規約" },
          { href: "/docs/6502/two-ways-in", label: "二つの入口: ページか HTTP か" },
        ],
      },
      {
        n: "3",
        title: "公開すると、チップが実測する",
        body: "公開は主張のアップロードではない。レジストリは掲載前にあなたのカートリッジをダイの上で走らせ、ROM の横に表示するのはチップがしたことだ: ブートしたか、何フレーム完了したか、各フレームに要した半サイクル数、使われたタイル。",
        href: "/6502/builders",
        link: "他の人が公開したもの",
      },
      {
        n: "4",
        title: "そして一命令をシリコンの中まで追う",
        body: "ウォークは Snake の一命令を五サイクルぶん深く追い、回路図はスイッチ網からその場で引き出される。このサイト全体が教えるために組まれたレッスンだ: 一行のコードが、開くゲートになるまで。",
        href: "/docs/6502/walk-snake",
        link: "Snake を一命令ぶん深く",
      },
    ],
    instruments: "計器",
    instrumentsLede: "どのビューも同じチップが、いま何をしているかで光る。エクスプローラ自身の分け方で並べている。",
    places: "場所",
    placesLede: "プロジェクトの残り。どれもここのページだ。",
    reading: "読みもの",
    readingLede: "このプロジェクトのドキュメント。読むべき順に。",
    parts: "各部品が応答する場所",
    thPart: "部品",
    thWhat: "何であるか",
    thToday: "今日応答する場所",
    thLands: "着地先",
    thStatus: "状態",
    proposed: "提案",
  },
} as const;


export function lesson(lang: Lang) {
  return LESSON[lang];
}
