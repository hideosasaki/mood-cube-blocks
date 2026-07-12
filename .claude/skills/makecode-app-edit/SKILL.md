---
name: makecode-app-edit
description: アプリ層MakeCodeプロジェクト (mood-cube-grip / mood-cube-touch / mood-cube-blocks-test) に関わる作業を頼まれたら必ず読む。アプリ層のコード編集はwebエディタ専用で、ローカルからmain.ts/main.blocksを変更してはいけない。ローカルで行ってよいのは拡張依存ハッシュの更新と実機テストビルドだけ。
---

# アプリ層MakeCodeプロジェクトの取り扱い

## 原則: コード編集はwebエディタでのみ行う

アプリ層 (grip / touch / blocks-test) の main.ts と main.blocks は、MakeCodeのwebエディタだけが正しく編集できる。ローカルでの main.ts 編集や main.blocks の再生成は禁止。

- 過去に「main.tsを編集してdecompileでmain.blocksを再同期する」スクリプト運用を試したが、blocksのレイアウトが初期化される事故が起きたため廃止した (2026-07-12)
- コード修正が必要なときは、webエディタでの修正手順 (どのブロックをどう変えるか) をユーザーに伝える。編集後、webエディタのGitHub連携がcommit/pushする

## ローカルで行ってよい作業

### 拡張依存ハッシュの更新

拡張 (mood-cube-blocks) の新しいコミットをアプリ層に取り込むときは、pxt.json の依存ハッシュを手で書き換える。

1. 拡張リポジトリで対象コミットのハッシュを確認する
2. アプリ層の pxt.json の `"mood-cube-blocks": "github:hideosasaki/mood-cube-blocks#<hash>"` を書き換える
3. pxt.json だけをcommitしてpushする (main.ts / main.blocks には触らない)
4. ユーザーにwebエディタでのpullと表示確認を依頼する。拡張のブロック構成が変わった場合 (ブロック廃止など) は、灰色ブロックの整理をwebエディタ側で行ってもらう

### 実機テストビルド

拡張の未pushの変更を実機で試すビルドは、pxt.json を一時的に `"file:../mood-cube-blocks"` へ切り替えて行う (local-hw-test-build のメモリ参照)。この切り替えは絶対にcommitせず、ビルド後すぐ元のGitHubハッシュ参照に戻す。

## 参照

- 開発フローの全体像: mood-cube-blocks/docs/development.md の「アプリ層を直すとき」
