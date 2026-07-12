// 電池駆動での P0 計測ファーム。シリアルの代わりにフラッシュ (MY_DATA.HTM) へ記録する。
// 手順とシナリオ番号→ラベルの対応は .claude/skills/measure-p0/SKILL.md を参照。
//
//   A+B: ログ全消去 (記録中は無効。セッション開始前に必ず行う)
//   A:   次のシナリオへ進んで記録開始 (LED にシナリオ番号を表示)
//   B:   記録停止 (小さい四角を表示)
//
// 起動時はログを消さない。USB を挿すとリセットがかかるが、記録済みデータは残る。
// 満杯になったら F を表示して以後の記録を止める (約2分強で満杯になるので
// 1セッション = シナリオ8本×15秒程度に収める)。

let _scenario = 0
let _logging = false
let _full = false

datalogger.includeTimestamp(FlashLogTimeStampFormat.Milliseconds)
datalogger.mirrorToSerial(false)

datalogger.onLogFull(function () {
    _full = true
    _logging = false
    basic.showString("F")
})

input.onButtonPressed(Button.AB, function () {
    if (_logging) return
    datalogger.deleteLog(datalogger.DeleteType.Fast)
    _scenario = 0
    _full = false
    basic.showString("C")
})

input.onButtonPressed(Button.A, function () {
    if (_full) return
    _scenario++
    _logging = true
    basic.showNumber(_scenario)
})

input.onButtonPressed(Button.B, function () {
    _logging = false
    basic.showIcon(IconNames.SmallSquare)
})

basic.showString("-")

// 加速度は20msごとの前回サンプルとの3軸差分和 (cubePower._accelDiffと同じ計算) を
// mo列に記録する。100ms窓の最大値化は解析側で行う
let _lastX = 0
let _lastY = 0
let _lastZ = 0
let _accelInit = false

basic.forever(function () {
    if (_logging) {
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
        datalogger.log(
            datalogger.createCV("p0", pins.analogReadPin(AnalogPin.P0)),
            datalogger.createCV("sc", _scenario),
            datalogger.createCV("mo", diff)
        )
    }
    basic.pause(20)
})
