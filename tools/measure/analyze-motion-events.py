# serialmotionファームの受信キャプチャ (mo:行) または docs/measurements の
# 保存CSV (time_ms,scenario,mo_win100) をシナリオ別に解析し、
# cubePower._stepMotionが見る「100ms窓の最大値」系列とイベント (動きの連続区間)
# を出力する。使い方は .claude/skills/measure-motion/SKILL.md を参照。
#
#   python3 tools/measure/analyze-motion-events.py <capture.txt | saved.csv>
#
# 旧flashlog (MY_DATA.HTM) 形式はdataloggerのハングで廃止した。旧形式のCSV
# (2026-07-13以前、20ms生値) を再解析するときはgit履歴の本スクリプトを使う。
#
# キャプチャにはリセット前の残留行が混じるので、タイムスタンプの巻き戻り以前は
# 捨てる。ビープ中 (sc=0) はスピーカー振動が乗るため集計から除外する。

import re, sys, statistics

STILL = 60      # cubePower.ts STILL_THRESHOLD の写し
MOTION = 200    # cubePower.ts MOTION_THRESHOLD の写し

samples = []  # (t_ms, sc, win_max)
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    m = re.fullmatch(r"mo:(\d{7}):(\d):(\d{4})", line.strip())
    if m is None:
        m = re.fullmatch(r"(\d+),(\d),(\d+)", line.strip())
    if m:
        samples.append((int(m.group(1)), int(m.group(2)), int(m.group(3))))

if not samples:
    print("no rows parsed")
    sys.exit(1)

# タイムスタンプが巻き戻る箇所より前は残留データ
start = 0
for i in range(1, len(samples)):
    if samples[i][0] < samples[i - 1][0]:
        start = i
if start:
    print(f"note: 残留 {start} 行を除外 (タイムスタンプ巻き戻り)")
samples = samples[start:]

gaps = [samples[i + 1][0] - samples[i][0] for i in range(len(samples) - 1)]
lost = sum(1 for g in gaps if g > 150)
print(f"rows={len(samples)} 窓間隔 median={statistics.median(gaps):.0f}ms "
      f"max={max(gaps)}ms 欠損(>150ms)={lost}")

by_sc = {}
for t, sc, w in samples:
    by_sc.setdefault(sc, []).append(w)

for sc in sorted(by_sc):
    if sc == 0:
        continue
    win = by_sc[sc]
    over_still = sum(1 for w in win if w >= STILL)
    over_motion = sum(1 for w in win if w >= MOTION)
    print(f"--- scenario {sc}: 窓数={len(win)} ({len(win)/10:.1f}s) max={max(win)} "
          f">=STILL({STILL}): {over_still} >=MOTION({MOTION}): {over_motion}")

    # イベント抽出: 窓値>=STILLの連続区間
    events = []
    cur = []
    for w in win:
        if w >= STILL:
            cur.append(w)
        else:
            if cur:
                events.append(cur)
                cur = []
    if cur:
        events.append(cur)
    for i, ev in enumerate(events):
        n200 = sum(1 for w in ev if w >= MOTION)
        print(f"    ev{i+1}: 窓数={len(ev)} ({len(ev)*100}ms) peak={max(ev)} "
              f"窓>={MOTION}が{n200}個 系列={ev[:16]}{'...' if len(ev)>16 else ''}")
