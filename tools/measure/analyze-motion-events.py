# flashlogファーム (mo列付き) で記録したMY_DATA.HTMをシナリオ別に解析し、
# cubePower._stepMotionが見る「5サンプル窓の最大値」系列とイベント (動きの連続区間)
# を出力する。使い方は .claude/skills/measure-motion/SKILL.md を参照。
#
#   python3 tools/measure/analyze-motion-events.py MY_DATA.HTM
#
# 注意: フラッシュ書き込み遅延で実効サンプリングは20msより粗い (実測~52ms)。
# 出力ヘッダのrateとgapで実効レートを必ず確認し、絶対値はファーム実動作 (20ms)
# と直接比較しないこと。窓数 (持続時間) の比較に使う。

import re, sys, statistics

STILL = 60
MOTION = 200

html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# datalogger HTM: CSV rows are embedded in the page. 行は "12345,678,2,90" 形式
rows = re.findall(r"(\d+(?:\.\d+)?),(\d+),(\d+),(\d+)", html)
samples = []  # (t_ms, sc, mo)
for t, p0, sc, mo in rows:
    samples.append((float(t), int(sc), int(mo)))

if not samples:
    print("no rows parsed")
    sys.exit(1)

by_sc = {}
for t, sc, mo in samples:
    by_sc.setdefault(sc, []).append((t, mo))

def pctl(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))]

for sc in sorted(by_sc):
    data = by_sc[sc]
    ts = [t for t, _ in data]
    mos = [m for _, m in data][1:]  # 先頭はdiff=0 (初期化)
    dur = (ts[-1] - ts[0]) / 1000
    gaps = [ts[i+1] - ts[i] for i in range(len(ts) - 1)]
    print(f"--- scenario {sc}: n={len(data)} dur={dur:.1f}s "
          f"rate={len(data)/dur:.1f}Hz gap median={statistics.median(gaps):.0f}ms max={max(gaps):.0f}ms")
    print(f"    20ms diff: med={statistics.median(mos):.0f} p95={pctl(mos,0.95)} max={max(mos)}")

    # 100ms窓 (5サンプル) の最大値系列 = _stepMotionが見る値
    win = [max(mos[i:i+5]) for i in range(0, len(mos) - 4, 5)]
    over_still = sum(1 for w in win if w >= STILL)
    over_motion = sum(1 for w in win if w >= MOTION)
    print(f"    100ms窓: n={len(win)} >=STILL({STILL}): {over_still} >=MOTION({MOTION}): {over_motion}")

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
    if events:
        print(f"    イベント数 (窓>=STILLの連続区間): {len(events)}")
        for i, ev in enumerate(events):
            n200 = sum(1 for w in ev if w >= MOTION)
            print(f"      ev{i+1}: 窓数={len(ev)} ({len(ev)*100}ms) peak={max(ev)} 窓>=200が{n200}個 系列={ev[:12]}{'...' if len(ev)>12 else ''}")
