#!/usr/bin/env bash
# アプリ層プロジェクト (grip / touch / blocks-test) で main.ts を編集した後に実行し、
# main.blocks を main.ts と整合した状態に更新する。
#
# 使い方: プロジェクトのルートで ../mood-cube-blocks/.claude/skills/makecode-app-edit/sync-blocks.sh
#
# 背景 (なぜこの同期が必要か):
#   MakeCodeプロジェクトは main.ts と main.blocks (XML) の2ファイルで成り立ち、
#   webエディタの表示は main.blocks が起点。main.ts だけ push しても、エディタで
#   pull したときに画面に変化がなく (JSビューも blocks から再生成される)、その状態で
#   エディタから保存すると ts 側の変更が上書きされて消える。`#github:` URL を開き
#   直しても再取得されず、一度 import したプロジェクトはブラウザ内のワークスペースが
#   開くだけ。だから main.ts を直したら main.blocks も一緒に更新して push する。
#
# やること:
#   1. pxt decompile で main.ts から main.blocks を再生成
#      - コンパイルエラーの検知も decompile が兼ねる (エラーがあると失敗する) ので、
#        事前の pxt build は不要 (remote の C++ ビルドを待たされるだけ)
#      - 拡張 (GitHub依存) を --dep で渡すのが必須。渡さないと拡張ブロックが
#        すべてグレーブロック (typescript_statement) に化ける
#      - npm版pxt-coreは libs/pxt-common を同梱しておらず decompile が内部エラーに
#        なるので、pxt_modules/core から実体をコピーして補う (下で毎回実施)
#   2. decompile は座標情報を落とすので、元の main.blocks からブロック座標を復元
#      (restore-blocks-layout.js)
#
# 実行後は main.ts と main.blocks を必ず一緒に commit して push する。
# webエディタ側では GitHub ボタンから pull して blocks 表示を目視確認する。
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f pxt.json || ! -f main.ts || ! -f main.blocks ]]; then
    echo "error: MakeCodeプロジェクトのルートで実行すること (pxt.json / main.ts / main.blocks が必要)" >&2
    exit 1
fi

GH_DEP="$(node -e '
    const deps = Object.entries(require(process.cwd() + "/pxt.json").dependencies)
        .filter(([, v]) => String(v).startsWith("github:")).map(([k]) => k)
    if (deps.length !== 1) {
        console.error("error: github型の依存がちょうど1つの想定 (実際: " + (deps.join(", ") || "なし") + ")")
        console.error("複数拡張には pxt decompile の --dep (単一指定のみ) が対応していない")
        process.exit(1)
    }
    console.log(deps[0])
')"
if [[ ! -d "pxt_modules/$GH_DEP" ]]; then
    echo "error: pxt_modules/$GH_DEP がない。先に pxt install を実行すること" >&2
    exit 1
fi

COMMON="node_modules/pxt-core/libs/pxt-common"
mkdir -p "$COMMON"
cp pxt_modules/core/pxt-core.d.ts pxt_modules/core/pxt-helpers.ts "$COMMON/"

OLD_BLOCKS="$(mktemp)"
trap 'rm -f "$OLD_BLOCKS"' EXIT
cp main.blocks "$OLD_BLOCKS"

pxt decompile main.ts --dep "pxt_modules/$GH_DEP"

if grep -q 'type="typescript_statement"' main.blocks; then
    echo "error: グレーブロック (typescript_statement) が生成された。main.ts に blocks 化できない構文がある" >&2
    echo "main.blocks を元に戻す。main.ts を修正して再実行すること" >&2
    cp "$OLD_BLOCKS" main.blocks
    exit 1
fi

node "$TOOLS_DIR/restore-blocks-layout.js" "$OLD_BLOCKS" main.blocks

echo ""
echo "main.blocks を同期した。main.ts と main.blocks を一緒に commit して push すること"
