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

basic.forever(function () {
    if (_logging) {
        datalogger.log(
            datalogger.createCV("p0", pins.analogReadPin(AnalogPin.P0)),
            datalogger.createCV("sc", _scenario)
        )
    }
    basic.pause(20)
})
