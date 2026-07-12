---
name: flash-microbit
description: micro:bit実機へのファーム書き込み (拡張テストファーム・blocks-test・flashlog計測ファーム) と書き込み後の動作検証の手順。「実機に書き込んで」「焼いて」「実機で確認したい」が合図。measure-p0など他の作業で実機に焼く必要が出たときも必ずこの手順に従う。
---

# micro:bit実機への書き込みと検証

手元のmicro:bit v2 (V2.00、KL27Z HIC、DAPLink 0255) への書き込み手順。MICROBITドライブへのhexコピーはこの個体では成立しないので、必ずpyOCDで書き込む。

## 書き込み前チェック (毎回)

1. ユーザーにMakeCodeエディタの接続解除を依頼する。WebUSBで接続したMakeCodeタブが開いていると、CMSIS-DAPインターフェースを掴まれてpyocdが「Unable to claim interface」で失敗し、シリアル読み取りも文字化けする。「MakeCodeのタブでデバイス接続していたら切断 (またはタブを閉じる) してください」と伝え、返事をもらってから進める
2. 自分が起動したシリアルリーダー (serialread.py) が残っていれば `pkill -f serialread.py` で止める
3. 変更がある場合は書き込み前に `make check` (型チェック+ローカルテスト) を通す

## ビルドと書き込み

pyocdはリポジトリ直下の `.venv` にある。なければ `python3 -m venv .venv && ./.venv/bin/pip install pyocd`。リポジトリ直下の `pyocd.yaml` (`cmsis_dap.prefer_v1: True`) が前提。これがないとmacOSではclaim interfaceで失敗する。CLIの `-O` 指定は効かない (pyocd/pyOCD#1556)。

書き込むhexは必ず `built/mbcodal-binary.hex` (v2用CODALバイナリ)。`built/binary.hex` はユニバーサルhexでpyocdが「invalid record type」で読めない。

```sh
./.venv/bin/pyocd flash -t nrf52833 <path>/built/mbcodal-binary.hex
```

エラー0x67 (flash erase sector failure) が出たら全消去してから再試行する。

```sh
./.venv/bin/pyocd erase -t nrf52833 --mass
```

### 対象別のビルド

- 拡張テストファーム (単体テスト+計測用生ログ): 拡張リポジトリ直下で `pxt build`
- flashlog計測ファーム (電池駆動・フラッシュ記録): `cd tools/measure/flashlog && pxt build`
- blocks-test (アプリ層での実機確認): 未pushの拡張変更を試すときは `../mood-cube-blocks-test/pxt.json` の依存を一時的に `"file:../mood-cube-blocks"` に切り替えて `pxt build`。書き込み後すぐ `git checkout pxt.json` でGitHubハッシュ参照に戻す。この切り替えはcommitしない

### やってはいけないこと

- MICROBITドライブへの `cp` / `dd` / Finderコピー。この個体はDAPLink既知問題 (file_stream.cアサート、error 521) で毎回失敗する
- MakeCodeエディタ接続中のpyocd実行・シリアル読み取り

## 書き込み後の検証

Claudeは画面を見られないので、LED表示の確認はユーザーに依頼する。期待表示は次のとおり。

- 拡張テストファーム: 起動時に単体テストが走り、全部通るとChessboard柄 (=生ログ送信中)。Noアイコン+数字は失敗数
- flashlog: `-` (待機中)
- blocks-test: アプリの起動表示

表示確認に加えて、変更した振る舞いそのものを実機で試す確認手順 (何をしたら何が起きるはずか) を具体的に伝えて結果をもらう。テスト通過と書き込み成功だけで「動いた」と報告しない。
