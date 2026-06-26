# 開発ガイド

mood-cube-blocks およびこれを利用するアプリ層リポジトリ (mood-cube-grip / mood-cube-touch / mood-cube-blocks-test) を触るときの環境構築と開発フローをまとめる。要件そのものは[requirements.md](requirements.md)を参照する。


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


## 補足: pxt serveについて

`pxt serve`はMakeCode target本体 (pxt-microbit) を開発するためのコマンドで、ユーザープロジェクトの編集には使えない。プロジェクトディレクトリで実行しても、ターゲットの`libs/`ディレクトリ探索に失敗してターゲットビルドが失敗し、ブラウザにはターゲット同梱のデフォルトプロジェクトが表示される。

ローカルでblocksエディタを動かしたい用途には対応していないので、blocksの編集・確認はweb版MakeCodeで行う。
