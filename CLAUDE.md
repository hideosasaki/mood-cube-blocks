# CLAUDE.md

micro:bit v2 用 MakeCode 拡張機能。フィジェット作品「mood cube」のためのハードウェア抽象層を提供する。

## Source of truth

要件は [docs/requirements.md](docs/requirements.md) に集約する。設計判断・スコープ・公開する機能の粒度はすべてここに書く。新しいセッションで作業を始めるときも、実装や設計の議論はこのファイルを起点にする。要件文書に書かれていないことを推測で実装しない。

## 開発の前提

- ターゲットは micro:bit v2 のみ
- Static TypeScript (MakeCode subset)。`any` / eval / 一部の高階関数は使えない
- 公開ブロックは JSDoc アノテーション (`//% block="..."`) で定義
- 内部依存として Microsoft/pxt-neopixel を pxt.json に含める (発光制御の実体)
- public リポジトリなので個人を特定する情報は書かない

## やらないこと

- 拡張内にアプリ層 (体験デザイン・意味付け) を書く
- 過剰なバリデーション・抽象化
- micro:bit v1 互換維持
- micro:bit 標準ブロックで足りるもの (LED 5x5・ボタン A/B・ロゴタッチ・磁気センサ・ラジオ) のラップ

## ソースコメント

- 子供が読む可能性のあるブロック文言 (`//% block="..."` の値) とドロップダウン enum の表示名は丁寧に書く
- 内部実装の TypeScript コメントは原則書かない。意図が明白な処理は無コメントで
