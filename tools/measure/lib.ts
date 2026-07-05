// シリアル生ログの集計としきい値決定の純ロジック。CLI・I/O は measure.ts が持つ。

export interface Stats {
    n: number
    min: number
    max: number
    median: number
    p5: number
    p95: number
}

export interface CaptureRecord {
    label: string
    at: string
    seconds: number
    stats: Stats
    samples: number[]
}

export interface TouchDecision {
    ok: boolean
    restFloor: number
    touchCeiling: number
    margin: number
    stuckBelow: number
    releasedAbove: number
}

export interface GripDecision {
    ok: boolean
    baseline: number
    rawFull: number
    span: number
}

// micro:bit の serial.writeValue("p0", v) は "p0:123" 形式の行を出す
export function parseValueLines(text: string): number[] {
    const values: number[] = []
    for (const line of text.split("\n")) {
        const m = line.trim().match(/^p0:(-?\d+)$/)
        if (m) values.push(parseInt(m[1], 10))
    }
    return values
}

export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) throw new Error("percentile: empty input")
    const rank = Math.ceil((p / 100) * sorted.length) - 1
    const idx = Math.min(sorted.length - 1, Math.max(0, rank))
    return sorted[idx]
}

export function computeStats(samples: number[]): Stats {
    if (samples.length === 0) throw new Error("computeStats: empty input")
    const sorted = samples.slice().sort((a, b) => a - b)
    return {
        n: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: percentile(sorted, 50),
        p5: percentile(sorted, 5),
        p95: percentile(sorted, 95),
    }
}

// 触感キューブ: タッチで値が下がる前提。
// off 側 (通常時・素手持ち) の p5 下限と on 側 (フォーク刺し) の p95 上限の間に
// マージンを取り、その 40%/60% 点をヒステリシス対にする
export const TOUCH_MARGIN_MIN = 40

export function decideTouch(offGroup: Stats[], onGroup: Stats[]): TouchDecision {
    if (offGroup.length === 0 || onGroup.length === 0) {
        throw new Error("decideTouch: both off and on groups are required")
    }
    const restFloor = Math.min(...offGroup.map(s => s.p5))
    const touchCeiling = Math.max(...onGroup.map(s => s.p95))
    const margin = restFloor - touchCeiling
    return {
        ok: margin >= TOUCH_MARGIN_MIN,
        restFloor,
        touchCeiling,
        margin,
        stuckBelow: Math.round(touchCeiling + margin * 0.4),
        releasedAbove: Math.round(touchCeiling + margin * 0.6),
    }
}

// 握りキューブ: 無負荷 median + 既存実装の BASELINE_MARGIN 相当をベースラインに、
// 最大握り p5 を強さ9の到達点にする
export const GRIP_BASELINE_MARGIN = 20
export const GRIP_SPAN_MIN = 200

export function decideGrip(rest: Stats, max: Stats): GripDecision {
    const baseline = rest.median + GRIP_BASELINE_MARGIN
    const rawFull = max.p5
    const span = rawFull - baseline
    return {
        ok: span >= GRIP_SPAN_MIN,
        baseline,
        rawFull,
        span,
    }
}

export function groupByPrefix(records: CaptureRecord[], prefixes: string[]): Stats[] {
    const out: Stats[] = []
    for (const r of records) {
        for (const p of prefixes) {
            if (r.label === p || r.label.startsWith(p + "-")) {
                out.push(r.stats)
                break
            }
        }
    }
    return out
}

export function formatStatsTable(records: CaptureRecord[]): string {
    const header = "label            n    min  p5   med  p95  max"
    const lines = [header]
    for (const r of records) {
        const s = r.stats
        lines.push(
            r.label.padEnd(16) +
            String(s.n).padEnd(5) +
            String(s.min).padEnd(5) +
            String(s.p5).padEnd(5) +
            String(s.median).padEnd(5) +
            String(s.p95).padEnd(5) +
            String(s.max)
        )
    }
    return lines.join("\n")
}
