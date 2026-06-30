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

アプリ層は基本的に子供がMakeCodeのwebエディタ ([https://makecode.microbit.org/](https://makecode.microbit.org/)) でblocksを並べて作る。ローカルで`main.ts`を直接編集することは原則しない。

理由は[ts/blocksの同期](#tsblocksの同期)に書く。

軽微な修正をローカルから入れるときの手順は次のとおり。

1. `main.ts`を編集する
2. `pxt build`でコンパイルが通ることを確認する (ブロック化可能なsubsetを逸脱していないかの粗い検知になる)
3. commitしてpushする
4. webエディタで対象リポジトリのURLを開く。webエディタがGitHubから読み込んでts→blocksをdecompileし、`main.blocks`が再生成される
    - mood-cube-grip: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-grip](https://makecode.microbit.org/#github:hideosasaki/mood-cube-grip)
    - mood-cube-touch: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-touch](https://makecode.microbit.org/#github:hideosasaki/mood-cube-touch)
    - mood-cube-blocks-test: [https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks-test](https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks-test)
5. blocks表示が想定どおりかを目視で確認する
6. webエディタの保存ボタンでGitHubに`main.blocks`の更新がpushされる

### ts/blocksの同期

MakeCodeプロジェクトは`main.ts`と`main.blocks` (XML) の双方向同期で成り立っている。`main.ts`だけ書き換えて`main.blocks`を放置すると、blocksエディタで開いたときに次のような壊れ方をする。

- ブロックがグレーアウトする、または消える
- 「JavaScriptで編集」モードに固定されてblocksに戻れない
- 子供がblocksエディタで上書き保存した瞬間にts側の変更が吹き飛ぶ

このため、ローカルで`main.ts`を直したら必ずwebエディタで開き直して`main.blocks`を同期させる。同期せずにpushしない。


## やってはいけないこと

### main.tsだけpushする

直前に書いたとおり、`main.blocks`との同期を取らずにpushすると壊れる。

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

実行方法:

1. ローカルで`pxt build`を実行する。test.tsも型チェック対象になり、コンパイルエラーがあれば検知できる
2. ブラウザで以下のURLを開く。MakeCodeがリポジトリを「拡張機能 + テストファイル」として読み込み、シミュレータでtest.tsが走る
   - [https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks](https://makecode.microbit.org/#github:hideosasaki/mood-cube-blocks)
3. MakeCodeエディタ上の「拡張機能のテスト」ボタンも同じシミュレータ実行をする

成功時は5x5 LEDにチェックマーク、失敗時は×マーク+失敗件数。シリアル出力 (画面下) に`=== N passed, M failed ===`が出る。

書き方の方針:

- 内部ヘルパは`_`プレフィックスでexportし、test.tsから直接呼ぶ。`cubeGrip._rawToStrength`、`cubeTouch._classifyAccel`、`cubePower._detectMotion`など
- 状態を持つ機能 (hysteresis、idle、beacon、motion baseline) はリセット用と観測用の`_testXxx`を併設してテスト駆動を可能にする
- assertヘルパは自前で持つ。`control.assert`はpanicするので、テストスイートとしては失敗を集計するassertが必要

シミュレータでは再現しきれない領域 (実際のADC値・容量タッチ・無線通信距離・deepSleepの消費電流) は実機での確認に回す。

### 実機統合テスト (mood-cube-blocks-testリポジトリ)

`mood-cube-blocks-test`は本拡張を依存に取り、実機にデプロイして手動で挙動確認するためのMakeCodeプロジェクト。ADC・PWM・ラジオ・電力管理など、シミュレータでは確認しきれない要素はこちらで触る。grip/touchとは別系統で、配線テスト用に独立している。


## 補足: pxt serveについて

`pxt serve`はMakeCode target本体 (pxt-microbit) を開発するためのコマンドで、ユーザープロジェクトの編集には使えない。プロジェクトディレクトリで実行しても、ターゲットの`libs/`ディレクトリ探索に失敗してターゲットビルドが失敗し、ブラウザにはターゲット同梱のデフォルトプロジェクトが表示される。

ローカルでblocksエディタを動かしたい用途には対応していないので、blocksの編集・確認はweb版MakeCodeで行う。
