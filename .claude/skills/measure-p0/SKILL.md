---
name: measure-p0
description: mood cube のP0アナログ値 (触感キューブのタッチ、握りキューブの圧力) を実測し、しきい値を決めるときに使う。tools/measure のCLIをClaude主導で実行し、シナリオ誘導から統計・推奨しきい値の算出、docs/measurements への保存まで行う。「しきい値を測りたい」「生ログを取りたい」「タッチ/握りの値を実測したい」が合図。
---

# P0計測としきい値決定

キューブのP0アナログ値を実測して、タッチ判定・握り強さのしきい値を決める手順。Claudeがコマンドを実行し、人間はキューブの物理操作だけを行う。

## 前提

### 計測ファームと動作確認ファームを混ぜない

計測に使えるのは拡張リポジトリのテストビルド (計測ファーム) だけ。blocks-test等のアプリ層ファームは、スリープ (3分無操作で突入しシリアルが止まる)・ラジオ・音・NeoPixelが動いて計測を汚すので使わない。MakeCodeエディタでデバイスに書き込むとアプリ層ファームに置き換わるため、計測セッションの開始時は必ず画面を確認する。Chessboard柄でなければ計測ファームを焼き直してから始める。シリアルの読み手は1本だけ (このツールのリーダーとMakeCodeコンソールは同時に使えない。両方開くと双方文字化けする)。

- デバイス側ファームウェアは拡張リポジトリのテストビルド。`pxt build` で `built/binary.hex` を作り、MICROBITボリュームにコピーして焼く (`cp` で拡張属性エラーが出たら `dd if=built/binary.hex of=/Volumes/MICROBIT/binary.hex`)
- 起動するとtest.tsの単体テストが走り、パスすると生ログが自動で始まる (Chessboard柄=送信中)。Bボタンで停止/再開を切り替えられる
- MakeCodeエディタのシリアルコンソールを閉じておく。シリアルポートは1プロセスしか掴めない
- シリアル読み取りは `tools/measure/serialread.py` (termios直接制御) で行う。`stty` + `cat` はDAPLink CDCからデータが取れないので使わない

## 手順

計測CLIは事前に `make measure` でビルドしておく (単体テストも同時に走る)。

シリアルポートを開くとmicro:bitがリセットされる。また物理リセットやUSB挿し直しでポート名が変わることがある (例: usbmodem1102→usbmodem11102)。このため計測ごとにポートを開閉する `capture` コマンドは連続計測に使えない。常駐リーダー+切り出しの方式を使う。リーダーはポート自動検出+切断時再接続なので、途中のリセットや再列挙は放っておけば復帰する。

1. 常駐リーダーを起動する (scratchpadに書き続ける)

   ```sh
   nohup python3 tools/measure/serialread.py 3600 > <scratchpad>/stream.txt 2>/dev/null &
   ```

2. micro:bitがリセットされ、テスト後に生ログが自動で始まる (Chessboard表示をユーザーに確認してもらう)
3. シナリオごとに「状態を作って維持してください」とチャットで依頼し、返事をもらってから切り出す

   ```sh
   tools/measure/capture-slice.sh <scratchpad>/stream.txt <ラベル> docs/measurements/<日付>-<条件>.json
   ```

4. 全シナリオ終了後、常駐リーダーをkillする

シリアル出力は文字欠けが起きることがある (DAPLink経由のUART取りこぼし)。ingestは完全な形の行しか数えないので統計は汚れないが、サンプル数が足りないときは `--seconds` を伸ばして対応する。

計測対象の状態はすべて静的 (置いたまま・刺したまま・握ったまま) なので、この分担で成立する。プルアップ抵抗の有無など条件を変えて比較するときは、セッションファイルを条件ごとに分ける (混ぜるとdecideが正しく計算できない)。

単発でよい場合 (リセット・B押し直しを許容できる場合) のみ `capture --label <ラベル>` が使える。

### ラベル規約

decideコマンドがprefixでグループ分けするため、ラベルは次の規約に従う。prefixの定義本体は `tools/measure/measure.ts` の `cmdDecide` にあり、この文書はその写し。規約を変えるときはコード側を直してからここを追従させる。

#### 触感キューブ (タッチで値が下がる想定)

- `rest` 系: 誰も触れていない通常時 (例: `rest`, `rest-desk`)
- `hand` 系: 素手でスポンジ越しに持っただけ。誤検出してはいけない側
- `fork-face1` 〜 `fork-face6`: フォークを握って各面に刺した状態

#### 握りキューブ

- `rest`: 無負荷
- `max`: 最大で握った状態
- 中間の強さも取るなら `squeeze-light` など自由 (decideには使われない。分布確認用)

### 決定

全シナリオ計測後に実行する。

```sh
node built/measure/measure.js decide --mode touch   # 触感キューブ
node built/measure/measure.js decide --mode grip    # 握りキューブ
```

- touch: ファーム (cubeTouch.ts) は適応参照値+エッジ検出で判定する (刺した信号は数十秒で減衰するため水位比較は不成立。2026-07-06実測)。decideの出力する baseline相対の推奨定数は、エッジ量 `TOUCH_STUCK_EDGE` / `TOUCH_RELEASE_EDGE` の参考値として読む。ただし静的シナリオの統計では「刺した瞬間の過渡」と「持ちっぱなしの減衰」が混ざるので、エッジ量の最終判断には60〜120秒の連続記録 (時系列のバケット分析) を併用する。ハードウェア前提は640kΩ (320kΩ×2直列) のP0→3Vプルアップ
- grip: restのmedian+20をbaseline、maxのp5を強さ9到達点として提案する。この「+20」は `cubeGrip.ts` の `BASELINE_MARGIN` の写し (`tools/measure/lib.ts` の `GRIP_BASELINE_MARGIN`)。拡張側を変えたらツール側も揃える

`list` で当日のセッション内容をいつでも確認できる。

## 結果の扱い

- セッションは `docs/measurements/<日付>.json` に生サンプルごと保存される。しきい値変更の根拠としてcommitする
- 推奨値をそのまま拡張の定数に自動反映はしない。採用はrequirements.mdの議論を通す

## トラブルシューティング

- 「サンプル数不足」: Bボタンで生ログが始まっているか (Chessboard表示)、MakeCodeのシリアルコンソールが開きっぱなしでないかを確認
- ポート複数検出: `--port` で明示する
- 値が全シナリオで同じに見える: 配線がP0に届いているかをワニ口で直接確認する
