# 開発ガイド

mood-cube-blocks およびこれを利用するアプリ層リポジトリ (mood-cube-grip / mood-cube-touch / mood-cube-blocks-test) を触るときの環境構築と開発フローをまとめる。


## リポジトリ構成

mood cubeを構成するリポジトリは4つある。

### mood-cube-blocks (このリポジトリ)

MakeCode拡張機能本体。Static TypeScriptでハードウェア抽象層を実装する。配線・センサ較正・タイミングなど、ハードウェアに近い層のブロックを提供する。

### mood-cube-grip / mood-cube-touch

子供が担当するアプリ層。MakeCodeのblocksエディタで体験ロジックを組む。mood-cube-blocksに依存する。

### mood-cube-blocks-test

mood-cube-blocksの公開ブロックを実機で動作確認するためのテスト用プロジェクト。mood-cube-blocksに依存する。grip/touchと同じくMakeCodeプロジェクトの形を取る。


## 開発環境

ローカルで型チェック・ビルドを通すために以下を用意する。

### 言語ランタイム

Nodeを使う。バージョン管理はmiseで行う。

```sh
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc  # 設定済みなら不要
mise use --global node@lts
```

### MakeCode CLI

pxtをグローバルインストールする。

```sh
npm install -g pxt
```

### プロジェクトごとの初期化

各プロジェクト (blocks / grip / touch / blocks-test) のディレクトリで一度だけ実行する。

```sh
cd <project-dir>
pxt target microbit
pxt install
```

`pxt target microbit`はmicro:bitターゲット (pxt-microbit) をローカルに展開し、`pxt install`が依存パッケージを取得する。

これでローカルで`pxt build`が通るようになる。


## 日常の開発フロー

mood-cube-blocksは公開APIを提供する側、grip/touch/blocks-testは利用する側として動作が異なる。

### mood-cube-blocks本体を直すとき

1. TypeScriptソース (`*.ts`) を編集する
2. `pxt build`でコンパイルが通ることを確認する
3. commitしてpushする
4. 利用側 (grip/touch/blocks-test) の`pxt.json`に書かれた依存ハッシュを必要に応じて更新する

### アプリ層 (grip / touch / blocks-test) を直すとき

アプリ層は子供がMakeCodeのwebエディタ ([https://makecode.microbit.org/](https://makecode.microbit.org/)) でblocksを並べて作る。コードの編集はwebエディタでのみ行い、ローカルから `main.ts` / `main.blocks` を変更しない。ローカルで `main.ts` を編集してdecompileで `main.blocks` を再同期する運用は、blocksのレイアウトが初期化される事故が起きたため廃止した (2026-07-12)。

ローカルからやってよいのは、`pxt.json` の拡張依存ハッシュの手動更新だけ。手順と制約は [makecode-app-edit skill](../.claude/skills/makecode-app-edit/SKILL.md) に書いてある。ハッシュ更新のpush後は、webエディタでプロジェクトを開き、画面下部のGitHubボタンからpullして、blocks表示を目視確認する。

- mood-cube-grip: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-grip](https://makecode.microbit.org/#github:hideosasaki/mood-cube-grip)
- mood-cube-touch: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-touch](https://makecode.microbit.org/#github:hideosasaki/mood-cube-touch)
- mood-cube-blocks-test: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks-test](https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks-test)


## やってはいけないこと

### main.tsだけpushする

`main.blocks`との同期を取らずにpushしても変更がwebエディタに現れず、エディタ側の保存で上書きされて消える (理由はsync-blocks.shのコメント参照)。

### blocksのsubsetを外れたts構文を書く

`main.ts`はMakeCodeのStatic TypeScript subsetで書く必要がある。サポート外の構文 (高度なクロージャ、`any`、対応外の高階関数など) を入れると、ブロック化できずにwebエディタで開いたときにグレーブロックや「JavaScriptとして保持」モードに落ちる。

`pxt build`で粗い検知はできるが、最終的にはwebエディタで開いてblocks表示を目視確認する。

### 公開APIを後方非互換に変える

mood-cube-blocks側で公開ブロックのsignature、enum値、ブロック表示文言 (`//% block="..."`)、引数順序を変えると、grip/touch/blocks-testの`main.blocks`に焼かれている参照が解決できず破損する。

公開APIを変更するときは、利用側のリポジトリでもwebエディタで開き直してblocksの再構築を確認する。


## テスト

mood-cube-blocksには2階層のテストがある。

### 単体テスト (test.ts)

ピュアロジック (ヒステリシス・classifyAccel・メッセージのエンコード/デコード・電力管理の状態判定など) はtest.tsにassertionベースで書く。pxt.jsonの`testFiles`に登録されているので、拡張機能を利用する側 (grip/touch/blocks-test) には降りない。拡張機能の開発時だけ実行される。

実行方法 (ローカルが基本):

```
make test    # ローカル (node) でtest.tsを実行する。数秒で終わる
make check   # pxt build (MakeCodeコンパイラでの型チェック) + make test
```

`make test`の仕組み: `tests/local/stubs.ts`がMakeCodeランタイムAPIの最小スタブを定義し、実ソース+test.tsごと素のtscで1本のJSにバンドルしてnodeで走らせる。test.tsが全件ピュアロジック (関数に値を入れて返り値を検証するだけ) なので成立している方法で、スケジューラ・イベントバス・32bit整数演算などのランタイム挙動は再現しない。テスト失敗時は終了コードが非ゼロになる (stubs.tsが×アイコン表示を終了コードに変換する)。

npm scriptsではなくMakefileなのは、package.jsonがpxtの生成物としてgitignoreされているため。

ブラウザのシミュレータ実行も残っているが、毎回は不要。pxt.jsonやブロック定義 (`//% block`) を触ったときに、MakeCodeエディタがリポジトリを正しく読み込めるかの確認として使う。

1. push後、ブラウザで以下のURLを開く。MakeCodeがリポジトリを「拡張機能 + テストファイル」として読み込み、シミュレータでtest.tsが走る
   - [https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks](https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks)
2. MakeCodeエディタ上の「拡張機能のテスト」ボタンも同じシミュレータ実行をする

成功時は5x5 LEDにチェックマーク、失敗時は×マーク+失敗件数。シリアル出力 (画面下) に`=== N passed, M failed ===`が出る。

書き方の方針:

- 内部ヘルパは`_`プレフィックスでexportし、test.tsから直接呼ぶ。`cubeGrip._rawToStrength`、`cubeTouch._classifyAccel`、`cubePower._detectMotion`など
- 状態を持つ機能 (hysteresis、idle、beacon、motion baseline) はリセット用と観測用の`_testXxx`を併設してテスト駆動を可能にする
- assertヘルパは自前で持つ。`control.assert`はpanicするので、テストスイートとしては失敗を集計するassertが必要
- テストはピュアロジックに限る。イベント発火やpauseに依存するテストを書くと`make test`のスタブでは動かない。ランタイムが絡む挙動は実機確認に回す
- MakeCodeのAPIを新しく使い始めたら、`tests/local/stubs.ts`にも対応するスタブを足す (`make test`がコンパイルエラーで教えてくれる)
- ソースファイル (cubeXxx.ts) を追加したら、pxt.jsonだけでなく`tests/local/tsconfig.json`の`files`にも足す。忘れてもtest.tsから参照した時点でコンパイルエラーになるが、参照されない限り黙って`make test`の対象外になる

シミュレータでは再現しきれない領域 (実際のADC値・容量タッチ・無線通信距離・deepSleepの消費電流) は実機での確認に回す。

### 実機計測ツール (tools/measure)

P0アナログ値 (触感キューブのタッチ、握りキューブの圧力) を実測してしきい値を決めるためのCLI。デバイス側はtest.tsの計測モード (Bボタンで生ログ送信) を使い、Mac側の`tools/measure`がシリアルから統計を取って推奨しきい値を出す。計測セッションは`docs/measurements/`に残す。

手順は [measure-p0 skill](../.claude/skills/measure-p0/SKILL.md) が持っていて、Claude Codeが計測コマンドの実行まで主導する。人間はキューブの物理操作 (置く・刺す・握る) だけを行う。ツールのビルドと単体テストは`make measure` (`make check`にも含まれる)。

### 実機統合テスト (mood-cube-blocks-testリポジトリ)

`mood-cube-blocks-test`は本拡張を依存に取り、実機にデプロイして手動で挙動確認するためのMakeCodeプロジェクト。ADC・PWM・ラジオ・電力管理など、シミュレータでは確認しきれない要素はこちらで触る。grip/touchとは別系統で、配線テスト用に独立している。


## 試して駄目だった道

- `pxt serve`: MakeCode target本体 (pxt-microbit) の開発用コマンドで、ユーザープロジェクトの編集には使えない。ローカルでblocksエディタを動かす手段はなく、blocksの編集・確認はweb版MakeCodeで行う
