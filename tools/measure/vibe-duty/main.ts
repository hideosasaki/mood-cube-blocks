// cubeVibe の強さ0〜9を実機で体感する確認ファーム。マッピングとキックスタートは
// 拡張本体 (cubeVibe.ts) のコードがそのまま動く。
//
//   B:    強さ +1 (回転中なら即反映)
//   A:    強さ -1 (同上)
//   ロゴ: 停止/再始動のトグル (静止からのキックスタート確認用)
//
// LED は現在の強さを数字表示。しきい値デューティの生実測 (25刻みの直接PWM sweep) の
// 手順と結果は docs/measurements/2026-07-16-vibe-duty.txt に記録済み。

let _strength = 1
let _running = false

function apply(): void {
    if (_running) {
        cubeVibe.start(_strength)
    } else {
        cubeVibe.stop()
    }
    basic.showNumber(_strength)
    serial.writeLine((_running ? "run s=" : "stop s=") + _strength)
}

input.onButtonPressed(Button.B, function () {
    _strength = Math.min(9, _strength + 1)
    apply()
})

input.onButtonPressed(Button.A, function () {
    _strength = Math.max(0, _strength - 1)
    apply()
})

input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    _running = !_running
    apply()
})

apply()
