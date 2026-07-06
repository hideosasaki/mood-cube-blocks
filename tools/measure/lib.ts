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
    offFloor: number
    dipCeiling: number
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

// デバイス側は "p0:0716" の4桁ゼロ埋め固定長で送る (test.ts)。
// シリアルの文字欠けで桁が落ちた行は形式不一致になり、ここで棄却される
export function parseValueLines(text: string): number[] {
    const values: number[] = []
    for (const line of text.split("\n")) {
        const m = line.trim().match(/^p0:(\d{4})$/)
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

// 触感キューブ: フォーク刺しは持続的な低下ではなく、商用ノイズの振動として下側に深く
// 突き刺さる波形で現れる (2026-07-06 実測)。そのためファームの判定は「観測窓内の最小値」で行う。
// しきい値は、fork 側の p5 上限 (最も浅い記録の落ち込み代表値) と off 側 (rest/hand) の
// 絶対最小値の間にマージンを取り、その 40%/60% 点をヒステリシス対にする
export const TOUCH_MARGIN_MIN = 40

export function decideTouch(offGroup: Stats[], onGroup: Stats[]): TouchDecision {
    if (offGroup.length === 0 || onGroup.length === 0) {
        throw new Error("decideTouch: both off and on groups are required")
    }
    const offFloor = Math.min(...offGroup.map(s => s.min))
    const dipCeiling = Math.max(...onGroup.map(s => s.p5))
    const margin = offFloor - dipCeiling
    return {
        ok: margin >= TOUCH_MARGIN_MIN,
        offFloor,
        dipCeiling,
        margin,
        stuckBelow: Math.round(dipCeiling + margin * 0.4),
        releasedAbove: Math.round(dipCeiling + margin * 0.6),
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
