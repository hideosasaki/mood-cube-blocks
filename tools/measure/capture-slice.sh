#!/bin/sh
# 常駐リーダー (serialread.py) が書き続けるストリームファイルから直近N秒分を切り出し、
# measure.js ingest でセッションに取り込む。
# usage: capture-slice.sh <stream-file> <label> <session-json> [seconds]
set -eu

# 非ログインシェルでも node が見つかるよう mise の shims を使う (mise activate 不要)
PATH="$HOME/.local/share/mise/shims:$PATH"

STREAM=$1
LABEL=$2
SESSION=$3
SEC=${4:-5}

OFFSET=$(wc -c < "$STREAM")
sleep "$SEC"
sleep 1
CHUNK=$(mktemp)
tail -c +"$((OFFSET + 1))" "$STREAM" > "$CHUNK"
node built/measure/measure.js ingest --label "$LABEL" --file "$CHUNK" --session "$SESSION" --seconds "$SEC"
rm -f "$CHUNK"
