// モーション実測ファーム (リアルタイムシリアル版)。datalogger (フラッシュ記録) は
// 書き込みがハングするバグで採用不可のため、計測は必ずシリアル送信で行う。
//
// 筐体に入れたままボタンに触れない状況を想定し、シナリオはスピーカーの合図で
// 自動進行する (ビープN回 = 2秒後にシナリオN開始、各20秒。最後に低い長め音)。
// ビープ中はシナリオ番号を0にするので、スピーカー振動が混じった行は解析側で
// sc=0を捨てれば除外できる。
//
// 送信は100ms窓の最大値 (= cubePower._stepMotionが見る値) を10Hzで行う。
// 20ms生値を送らないのは帯域を1/5に抑えて欠損を減らすため。各行にタイムスタンプを
// 載せ、受信側で行間隔から欠損を検出できるようにする。
// 形式: mo:<runningTime下7桁ゼロ埋めms>:<シナリオ番号1桁>:<窓最大値4桁>
// 固定長なので文字欠けした行は桁数不一致で棄却できる。

const BOOT_WAIT_MS = 15000
const SCENARIO_MS = 20000
const SCENARIOS = 4

let _scenario = 0

function _pad(n: number, width: number): string {
    const s = "0000000" + n
    return s.substr(s.length - width)
}

// 差分は20msごとの前回サンプルとの3軸差分和 (cubePower._accelDiffと同じ計算)
let _lastX = 0
let _lastY = 0
let _lastZ = 0
let _accelInit = false
let _tick = 0
let _windowMax = 0

// basic.foreverは1周ごとに約20msの追加yieldが入り実効40ms/tickになる
// (2026-07-19実測: 窓間隔200ms)。素のループで20ms/tickを守る
control.inBackground(function () {
    while (true) {
        _motionTick()
        basic.pause(20)
    }
})

function _motionTick(): void {
    const x = input.acceleration(Dimension.X)
    const y = input.acceleration(Dimension.Y)
    const z = input.acceleration(Dimension.Z)
    let diff = 0
    if (!_accelInit) {
        _accelInit = true
    } else {
        diff = Math.abs(x - _lastX) + Math.abs(y - _lastY) + Math.abs(z - _lastZ)
    }
    _lastX = x
    _lastY = y
    _lastZ = z
    if (diff > _windowMax) _windowMax = diff
    _tick++
    if (_tick >= 5) {
        serial.writeString(
            "mo:" + _pad(input.runningTime() % 10000000, 7) +
            ":" + _scenario +
            ":" + _pad(Math.min(_windowMax, 9999), 4) + "\n")
        _tick = 0
        _windowMax = 0
    }
}

basic.showString("-")

control.inBackground(function () {
    basic.pause(BOOT_WAIT_MS)
    for (let i = 1; i <= SCENARIOS; i++) {
        for (let j = 0; j < i; j++) {
            music.playTone(880, 150)
            basic.pause(150)
        }
        basic.pause(2000)
        _scenario = i
        basic.pause(SCENARIO_MS)
        _scenario = 0
    }
    music.playTone(440, 600)
})
