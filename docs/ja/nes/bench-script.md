# ベンチの台本

一つのテキストファイルが、ヘッド上の走行 (`head/headd.py`、`tools/bench.py run`
が送る) を駆動し、同じ言葉のまま模型 (`nes-console` の `pad-log` が `AT` 行を
取る) も駆動する。1 行は一つの語とその引数で、`#` からはコメント。ラッチ番号は
最後の `RESET` からのコンソールのコントローラストローブの数で、ゼロから始まる。
ブリッジのログと模型のログが共有しているのがこの番号だ。

| 行 | ヘッドでは | 模型では |
|---|---|---|
| `RESET` | ブリッジのカウンタをゼロにし、それからリセットリレーをパルスする | コンソールはラッチゼロで電源が入る (`pad-log`)。`bench-script` は CPU の /RESET をヘッドと同じ半秒だけ保持して放す。温間リセットだ |
| `POWER ON` / `POWER OFF` | 電源リレー | 何もしない |
| `MODE PASS` / `MODE INJECT` | ブリッジに渡される: 元のパッドのバイトか、台本のバイトか | 模型は手元にパッドを持たない: `INJECT` が唯一のモード |
| `SET hh` | いま保持するバイト (ビット 0 = A、立っていれば押下) | 最初から保持するバイト |
| `AT n hh` | ラッチ n から先は hh を保持する。ラッチ n-1 の後に書くので、ラッチ n の時点でレジスタに入っている | コントローラの予定表。ラッチ n の前のストローブの立ち上がりで適用される |
| `TRIG n` | ブリッジがラッチ n で EXT TRIG を上げる。`ARM` は数秒かかるので、その後に置くこと | 何もしない (模型は n のフレームを直接描く) |
| `ARM name [channels] [scale] [offset] [source] [s/div] [depth]` | スコープを単発撮りに設定する: チャネルは `3` または `1,2,4`、トリガはチャネルから (`CH1`。ブリッジの TRIG 線がここに来ている。DS1054Z に EXT 入力は無く、古い既定値だった `EXT` は名指しで拒まれる)、時間軸とメモリ深度 (1 チャネルか 2 チャネルで 12 M 点、それより多いと最大 6 M)。捕捉は `name.u8` (1 チャネル) か `name-chN.u8` (複数) で、レートとトリガのサンプルを書いた `name.toml` が隣に並ぶ | 何もしない |
| `CAPTURE` | 仕掛けたトリガを待って記録を読む (トリガを過ぎた `WAIT` もこれをやる) | 何もしない |
| `WAIT n` | ブリッジが最後の `RESET` からラッチ n を記録するまで待つ (ヘッドはブリッジの `# reset` で自分のカウントを消す。2026-09-18 より前は前のセッションのものを持ち越していて、`RESET` の後の `WAIT` が即座に返ることがあった。`open-items.md`) | ポール n まで走らせる (`bench-script` は、ブリッジと同じく、各 `RESET` から数える) |
| `WAIT s S` | 秒 | 何もしない |

計画が書いているとおりの B1 の台本:

```
POWER ON
WAIT 2 S
MODE INJECT
SET 00
RESET
AT 120 08          # Start, ポール 120 から
AT 122 00
ARM game-t300 1,3 0.2 -0.5 CH1   # 映像を CH3 に 200 mV/div で、その隣の CH1 にトリガ線を
TRIG 300
WAIT 320
CAPTURE
```

ヘッドは走行を `runs/<stamp>/` に書き (`script.txt`、演奏した行をそのまま並べた
`head.log`、ブリッジが印字した行をすべて収めた `bridge.log`、そして捕捉)、
`bench.py` がそれを取ってくる。`compare-logs.py` は同じ台本について
`bridge.log` と `pad-log` の出力を差分する。

B2 の台本、電源投入が一回 (`tools/b2-align.py sweep` はこれを N 回演奏して
各走行を分類する):

```
POWER OFF
WAIT 3 S
ARM align 1,2,4 1.0 -2.0 CH4 0.0005 1200000   # マスタクロック、M2、ALE。描画が始まる ALE の最初の立ち上がりでトリガ
POWER ON
CAPTURE
POWER OFF
```


*ビルド時に [nes-bench/docs/script.md](https://github.com/tinymachines/nes-bench/blob/main/docs/script.md) から取り込んでいる。写しはリポジトリの一つだけだ。報告には私たちの間の言葉がいくつか残っている: [報告書で使われる言葉](/ja/docs/words)。*
