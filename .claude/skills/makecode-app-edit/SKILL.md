---
name: makecode-app-edit
description: アプリ層MakeCodeプロジェクト (mood-cube-grip / mood-cube-touch / mood-cube-blocks-test) のコードをローカルから編集するときに必ず使う。main.tsだけ編集してpushするとwebエディタに変更が現れず、エディタ側の保存で消えるため、main.blocksの同期までを一体の手順として行う。
---

# アプリ層MakeCodeプロジェクトの編集

grip / touch / blocks-test の main.ts を編集してほしいと言われたら、この手順に従う。

## 前提

- webエディタの表示は main.blocks が起点。main.ts だけの push は「変更が現れない → エディタ保存で消える」事故になる
- grip / touch は子供の作品。頼まれた最小限の修正だけを入れ、リファクタリングや整理はしない

## 手順

1. main.ts を編集する
   - blocks に decompile できる Static TS subset のみ。既存コード (decompile済みスタイル) の書き方に合わせる
   - トップレベルのイベント登録・`function` 宣言・`let` 変数はOK。クラス・アロー関数の変数代入・型注釈は使わない
2. プロジェクトのルートで同期スクリプトを実行する

   ```sh
   eval "$(mise activate zsh)" && ../mood-cube-blocks/.claude/skills/makecode-app-edit/sync-blocks.sh
   ```

   main.blocks の再生成 → ブロック座標の復元をまとめて行う (コンパイルエラーの検知も兼ねる)。エラー時の対処はスクリプトが出すメッセージに従う
3. 出力を確認する
   - `restored: N block(s)`: 既存ブロックの座標が復元された数
   - `new (auto-placed below): ...`: 追加したハンドラ。既存配置の下に置かれる
   - `removed since old layout: ...`: 削除したハンドラ。意図した削除か確認する
4. main.ts と main.blocks を必ず一緒に commit する。片方だけの commit は禁止
5. push したら、ユーザーに次を依頼する
   - webエディタでプロジェクトを開き、画面下部の GitHub ボタンから pull
   - blocks 表示が想定どおりか目視確認 (特に grip / touch は配置が保たれているか)

## 参照

- 手順の背景と全体像: mood-cube-blocks/docs/development.md の「アプリ層を直すとき」
- スクリプトの内部挙動: このディレクトリの sync-blocks.sh と restore-blocks-layout.js のコメント
