import test = require("node:test")
import assert = require("node:assert")
import {
    computeStats,
    decideGrip,
    decideMotion,
    decideTouch,
    groupByPrefix,
    parseMotionLines,
    parseValueLines,
    percentile,
    poseRate,
    CaptureRecord,
    Stats,
} from "./lib"

function record(label: string, samples: number[]): CaptureRecord {
    return { label: label, at: "2026-01-01T00:00:00Z", seconds: 5, stats: computeStats(samples), samples: samples }
}

test("parseValueLines: 4桁固定長の行だけを拾う", function () {
    const text = "p0:0330\r\np0:0335\ngarbage\np1:0100\np0:012x\n p0:0120 \np0:1023\n"
    assert.deepStrictEqual(parseValueLines(text), [330, 335, 120, 1023])
})

test("parseValueLines: 文字欠けで桁が落ちた行は棄却", function () {
    assert.deepStrictEqual(parseValueLines(""), [])
    assert.deepStrictEqual(parseValueLines("p0:716\np0:16\np0:07166\n"), [])
})

test("parseMotionLines: mo:4桁:1桁 の行だけを拾う", function () {
    const text = "mo:0012:1\r\nmo:0345:0\np0:0704\ngarbage\nmo:12:1\nmo:0012:7\nmo:9999:6\n"
    assert.deepStrictEqual(parseMotionLines(text), [
        { diff: 12, face: 1 },
        { diff: 345, face: 0 },
        { diff: 9999, face: 6 },
    ])
})

test("parseMotionLines: 文字欠け・空入力は棄却", function () {
    assert.deepStrictEqual(parseMotionLines(""), [])
    assert.deepStrictEqual(parseMotionLines("mo:012:1\nmo:0012:\nmo:00012:1\n"), [])
})

test("poseRate: classify≠0 の割合", function () {
    const samples = [
        { diff: 10, face: 1 },
        { diff: 20, face: 0 },
        { diff: 30, face: 6 },
        { diff: 40, face: 0 },
    ]
    assert.strictEqual(poseRate(samples), 0.5)
})

test("poseRate: 空入力は0", function () {
    assert.strictEqual(poseRate([]), 0)
})

test("decideMotion: マージン十分なら静止閾値を返す", function () {
    const desk = computeStats([2, 4, 6, 8, 10])
    const hand = [computeStats([60, 80, 100]), computeStats([50, 90, 120])]
    const d = decideMotion(desk, hand)
    assert.strictEqual(d.deskCeiling, 10)
    assert.strictEqual(d.handFloor, 50)
    assert.strictEqual(d.margin, 40)
    assert.strictEqual(d.ok, true)
    assert.strictEqual(d.stillThreshold, 30)
})

test("decideMotion: 手持ちの下限が机置きに迫るとok=false", function () {
    const desk = computeStats([5, 10, 15])
    const hand = [computeStats([20, 30, 40])]
    const d = decideMotion(desk, hand)
    assert.strictEqual(d.margin, 5)
    assert.strictEqual(d.ok, false)
})

test("decideMotion: handグループ欠落はthrow", function () {
    assert.throws(function () { decideMotion(computeStats([1]), []) })
})

test("percentile: nearest-rank", function () {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    assert.strictEqual(percentile(sorted, 5), 10)
    assert.strictEqual(percentile(sorted, 50), 50)
    assert.strictEqual(percentile(sorted, 95), 100)
})

test("percentile: 空入力はthrow", function () {
    assert.throws(function () { percentile([], 50) })
})

test("computeStats: 未ソート入力", function () {
    const s = computeStats([300, 100, 200])
    assert.strictEqual(s.n, 3)
    assert.strictEqual(s.min, 100)
    assert.strictEqual(s.max, 300)
    assert.strictEqual(s.median, 200)
})

test("decideTouch: マージン十分ならヒステリシス対を返す", function () {
    const off = [computeStats([960, 978, 995])]
    const on = [computeStats([841, 976, 1023])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.offFloor, 960)
    assert.strictEqual(d.dipCeiling, 841)
    assert.strictEqual(d.margin, 119)
    assert.strictEqual(d.ok, true)
    assert.strictEqual(d.stuckBelow, 889)
    assert.strictEqual(d.releasedAbove, 912)
})

test("decideTouch: forkの落ち込みがoff側最小に迫るとok=false", function () {
    const off = [computeStats([950, 970, 990])]
    const on = [computeStats([930, 980, 1023])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.margin, 20)
    assert.strictEqual(d.ok, false)
})

test("decideTouch: 複数ラベルの最悪値を採る", function () {
    const off = [computeStats([960, 990]), computeStats([940, 980])]
    const on = [computeStats([800, 1000]), computeStats([860, 1010])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.offFloor, 940)
    assert.strictEqual(d.dipCeiling, 860)
})

test("decideTouch: グループ欠落はthrow", function () {
    assert.throws(function () { decideTouch([], [computeStats([1])]) })
})

test("decideGrip: baselineとrawFull", function () {
    const rest = computeStats([60, 62, 64])
    const max = computeStats([850, 900, 950])
    const d = decideGrip(rest, max)
    assert.strictEqual(d.baseline, 82)
    assert.strictEqual(d.rawFull, 850)
    assert.strictEqual(d.ok, true)
})

test("decideGrip: span不足でok=false", function () {
    const d = decideGrip(computeStats([500]), computeStats([600]))
    assert.strictEqual(d.ok, false)
})

test("groupByPrefix: 完全一致とハイフン区切りprefixだけを拾う", function () {
    const records = [
        record("rest", [1]),
        record("rest-night", [2]),
        record("restless", [3]),
        record("fork-face1", [4]),
        record("hand", [5]),
    ]
    const off = groupByPrefix(records, ["rest", "hand"])
    assert.strictEqual(off.length, 3)
    const on = groupByPrefix(records, ["fork"])
    assert.strictEqual(on.length, 1)
})
