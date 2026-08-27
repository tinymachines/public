# MCP

`POST /mcp` は Model Context Protocol をストリーマブル HTTP で話す。セッション無し、SSE ストリーム無し。[API](/ja/docs/6502/the-api) がセッションを持たないのと同じ理由だ。

ツールは五つ: `console_spec`、`assemble`、`run`、`mint_cartridge`、
`chip_atlas`。

## クライアントをつなぐ

チップのエンドポイントと、サイトのエンドポイント。後者には、各ピースが何で、いまどれが応答しているかを答える三つのツールがある:

```
https://6502.tinymachines.ai/api/mcp
https://tinymachines.ai/api/mcp
```

Claude Code なら:

```
claude mcp add --transport http 6502 https://6502.tinymachines.ai/api/mcp
claude mcp add --transport http tinymachines https://tinymachines.ai/api/mcp
```

`mcpServers` ブロックを読むクライアント (Claude Desktop、Cursor など) なら:

```json
{
  "mcpServers": {
    "6502": { "type": "http", "url": "https://6502.tinymachines.ai/api/mcp" },
    "tinymachines": { "type": "http", "url": "https://tinymachines.ai/api/mcp" }
  }
}
```

鍵も、セッションヘッダも、開くべきストリームも無い。どちらのサーバもプロトコルの `2025-06-18`、`2025-03-26`、`2024-11-05` の各改訂を話す。それより新しい改訂を求めるクライアントには、この中で最新のもので応える。これはプロトコルが定める通りの振る舞いだ。どちらのエンドポイントへの `GET` も `Allow: POST` 付きの 405: SSE ストリームは無く、まず `GET` でストリームを開く旧い HTTP+SSE トランスポートは話さない。

## HTTP ルートが細粒度である一方、ツールは粗い

これは設計であって、見落としではない。

API がステートレスなのは、*プログラム*がマシンを保持するからだ: 2 KB の
16 進数が出て行って戻ってきて、クライアントの持つ写しがセッションになる。
MCP のクライアントは言語モデルであり、モデルは 2 KB の 16 進数を有用な形で保持できない。だから `run` は、アセンブルし、ブートし、ステップし、報告するまでを一度の呼び出しで済ませ、マシンはサーバを離れない。

## run は画面を描画する

`run` は画面を、1 セルあたり 16 進数 2 文字で描画する。

6502 のゲーム作りを当てずっぽうから作業に変えるのは、この一点だ:
アセンブラはバイト列が合法だと言うだけで、プログラムが正しいと言うのは画だけだ。

## 何が正直さを保っているか

MCP のスイートは、表を引く代わりに、このプロジェクト自身の証人を再現する。
`$2E + $14` は半サイクル 41 までに `$0082` で `$42` と読める。これはプログラムのページ、API リファレンス、サービスのスイートが揃って述べる数字だ。

その経路のどこにも命令表を引くものが無いので、一致は言い換えではなく証拠になる。
