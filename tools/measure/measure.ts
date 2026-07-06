// P0 生ログの計測 CLI。使い方は .claude/skills/measure-p0/SKILL.md を参照
//
//   node built/measure/measure.js capture --label rest [--seconds 5] [--port /dev/cu.usbmodemXXX] [--session path]
//   node built/measure/measure.js ingest  --label rest --file raw.txt [--session path]
//   node built/measure/measure.js list   [--session path]
//   node built/measure/measure.js decide --mode touch|grip [--session path]

import { spawn } from "node:child_process"
import * as fs from "node:fs"
import {
    CaptureRecord,
    computeStats,
    decideGrip,
    decideTouch,
    formatStatsTable,
    groupByPrefix,
    parseValueLines,
} from "./lib"

const DEFAULT_SECONDS = 5
const MIN_SAMPLES_PER_SECOND = 10

function findPort(): string {
    const ports = fs.readdirSync("/dev")
        .filter(function (name) { return name.startsWith("cu.usbmodem") })
        .map(function (name) { return "/dev/" + name })
    if (ports.length === 0) {
        throw new Error("micro:bit が見つからない (/dev/cu.usbmodem* なし)。USB 接続を確認")
    }
    if (ports.length > 1) {
        throw new Error("シリアルポートが複数ある: " + ports.join(", ") + " — --port で指定")
    }
    return ports[0]
}

function defaultSessionPath(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const d = String(now.getDate()).padStart(2, "0")
    return "docs/measurements/" + y + "-" + m + "-" + d + ".json"
}

function loadSession(path: string): CaptureRecord[] {
    if (!fs.existsSync(path)) return []
    return JSON.parse(fs.readFileSync(path, "utf8")) as CaptureRecord[]
}

function saveSession(path: string, records: CaptureRecord[]): void {
    fs.mkdirSync("docs/measurements", { recursive: true })
    fs.writeFileSync(path, JSON.stringify(records, null, 2) + "\n")
}

function parseArgs(argv: string[]): { cmd: string; opts: { [key: string]: string } } {
    const cmd = argv[0] || ""
    const opts: { [key: string]: string } = {}
    for (let i = 1; i < argv.length; i += 2) {
        if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
            throw new Error("引数の形式が不正: " + argv[i])
        }
        opts[argv[i].slice(2)] = argv[i + 1]
    }
    return { cmd, opts }
}

// stty + cat では DAPLink CDC からデータが取れない (DTR とtermios設定の問題) ため、
// termios を直接制御する serialread.py に読み取りを委ねる
function captureRaw(port: string, seconds: number): Promise<string> {
    return new Promise(function (resolve, reject) {
        let buf = ""
        const child = spawn("python3", ["tools/measure/serialread.py", port, String(seconds)])
        child.on("error", reject)
        child.stdout.on("data", function (chunk) { buf += String(chunk) })
        child.on("close", function () { resolve(buf) })
    })
}

function storeRecord(label: string, seconds: number, raw: string, sessionPath: string): void {
    const samples = parseValueLines(raw)
    if (samples.length < seconds * MIN_SAMPLES_PER_SECOND) {
        throw new Error(
            "サンプル数不足 (" + samples.length + "件)。" +
            "micro:bit の B ボタンで生ログが開始されているか (Chessboard 表示)、" +
            "MakeCode のシリアルコンソールが閉じているかを確認"
        )
    }
    const record: CaptureRecord = {
        label: label,
        at: new Date().toISOString(),
        seconds: seconds,
        stats: computeStats(samples),
        samples: samples,
    }
    const records = loadSession(sessionPath)
    records.push(record)
    saveSession(sessionPath, records)
    console.log(formatStatsTable([record]))
    console.log("saved: " + sessionPath + " (" + records.length + " records)")
}

async function cmdCapture(opts: { [key: string]: string }): Promise<void> {
    const label = opts["label"]
    if (!label) throw new Error("--label は必須")
    const seconds = opts["seconds"] ? parseInt(opts["seconds"], 10) : DEFAULT_SECONDS
    const port = opts["port"] || findPort()
    const sessionPath = opts["session"] || defaultSessionPath()

    console.log("capture: label=" + label + " port=" + port + " seconds=" + seconds)
    const raw = await captureRaw(port, seconds)
    storeRecord(label, seconds, raw, sessionPath)
}

// ポートを開きっぱなしの常駐リーダーが書くファイルから、切り出した生テキストを取り込む
function cmdIngest(opts: { [key: string]: string }): void {
    const label = opts["label"]
    if (!label) throw new Error("--label は必須")
    const file = opts["file"]
    if (!file) throw new Error("--file は必須")
    const seconds = opts["seconds"] ? parseInt(opts["seconds"], 10) : DEFAULT_SECONDS
    const sessionPath = opts["session"] || defaultSessionPath()
    storeRecord(label, seconds, fs.readFileSync(file, "utf8"), sessionPath)
}

function cmdList(opts: { [key: string]: string }): void {
    const sessionPath = opts["session"] || defaultSessionPath()
    const records = loadSession(sessionPath)
    if (records.length === 0) {
        console.log("記録なし: " + sessionPath)
        return
    }
    console.log(formatStatsTable(records))
}

function cmdDecide(opts: { [key: string]: string }): void {
    const sessionPath = opts["session"] || defaultSessionPath()
    const records = loadSession(sessionPath)
    if (records.length === 0) throw new Error("記録なし: " + sessionPath)
    console.log(formatStatsTable(records))
    console.log("")

    const mode = opts["mode"]
    if (mode === "touch") {
        const off = groupByPrefix(records, ["rest", "hand"])
        const on = groupByPrefix(records, ["fork"])
        const d = decideTouch(off, on)
        console.log("offFloor (rest/hand側の絶対最小): " + d.offFloor)
        console.log("dipCeiling (fork側p5の上限): " + d.dipCeiling)
        console.log("margin: " + d.margin + (d.ok ? "" : "  ← 不足。この電極構成ではしきい値が安全に引けない"))
        console.log("推奨: 窓内最小値 < " + d.stuckBelow + " で刺さった / 窓内最小値 > " + d.releasedAbove + " で抜けた")
    } else if (mode === "grip") {
        const rest = groupByPrefix(records, ["rest"])
        const max = groupByPrefix(records, ["max"])
        if (rest.length === 0 || max.length === 0) throw new Error("rest と max のラベルが必要")
        const d = decideGrip(rest[0], max[0])
        console.log("baseline (強さ0上限): " + d.baseline)
        console.log("rawFull (強さ9到達点): " + d.rawFull)
        console.log("span: " + d.span + (d.ok ? "" : "  ← 不足。分圧抵抗かセンサ素材の見直しを検討"))
    } else {
        throw new Error("--mode touch または --mode grip を指定")
    }
}

async function main(): Promise<void> {
    const { cmd, opts } = parseArgs(process.argv.slice(2))
    if (cmd === "capture") await cmdCapture(opts)
    else if (cmd === "ingest") cmdIngest(opts)
    else if (cmd === "list") cmdList(opts)
    else if (cmd === "decide") cmdDecide(opts)
    else {
        console.error("usage: measure.js capture|ingest|list|decide [--options]")
        process.exitCode = 1
    }
}

main().catch(function (err) {
    console.error(String(err && (err as { message?: string }).message || err))
    process.exitCode = 1
})
