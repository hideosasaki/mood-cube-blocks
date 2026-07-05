import test = require("node:test")
import assert = require("node:assert")
import {
    computeStats,
    decideGrip,
    decideTouch,
    groupByPrefix,
    parseValueLines,
    percentile,
    CaptureRecord,
    Stats,
} from "./lib"

function record(label: string, samples: number[]): CaptureRecord {
    return { label: label, at: "2026-01-01T00:00:00Z", seconds: 5, stats: computeStats(samples), samples: samples }
}

test("parseValueLines: writeValue形式の行だけを拾う", function () {
    const text = "p0:330\r\np0:335\ngarbage\np1:100\np0:12x\n p0:120 \n"
    assert.deepStrictEqual(parseValueLines(text), [330, 335, 120])
})

test("parseValueLines: 途切れた行や空入力", function () {
    assert.deepStrictEqual(parseValueLines(""), [])
    assert.deepStrictEqual(parseValueLines("p0:3"), [3])
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
    const off = [computeStats([320, 330, 340])]
    const on = [computeStats([100, 120, 140])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.restFloor, 320)
    assert.strictEqual(d.touchCeiling, 140)
    assert.strictEqual(d.margin, 180)
    assert.strictEqual(d.ok, true)
    assert.strictEqual(d.stuckBelow, 212)
    assert.strictEqual(d.releasedAbove, 248)
})

test("decideTouch: off/onが重なるとok=false", function () {
    const off = [computeStats([150, 200, 250])]
    const on = [computeStats([100, 180, 240])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.ok, false)
})

test("decideTouch: 複数ラベルの最悪値を採る", function () {
    const off = [computeStats([320, 330]), computeStats([280, 300])]
    const on = [computeStats([100, 120]), computeStats([150, 170])]
    const d = decideTouch(off, on)
    assert.strictEqual(d.restFloor, 280)
    assert.strictEqual(d.touchCeiling, 170)
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
