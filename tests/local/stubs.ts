// ローカル (node) テスト実行用の MakeCode ランタイムスタブ。
// test.ts のピュアロジックテストを走らせるための最小定義で、
// スケジューラ・イベントバス等のランタイム挙動は再現しない。

declare const console: { log(msg: string): void }
declare const process: { exitCode: number }

interface Math {
    idiv(a: number, b: number): number
}
Math.idiv = function (a: number, b: number): number {
    return Math.trunc(a / b)
}

enum AnalogPin { P0, P1 }
enum Button { A, B }
enum DigitalPin { P1, P2 }
enum Dimension { X, Y, Z }
enum FullPowerSource { A, B, P0 }
enum IconNames { No, Yes, Chessboard }
enum LowPowerMode { Wait }
enum NeoPixelColors { Black }
enum NeoPixelMode { RGB }
enum TouchPin { P0 }
enum TouchTarget { P0 }
enum TouchTargetMode { Capacitive }

namespace serial {
    export function writeLine(s: string): void {
        console.log(s)
    }
    export function writeValue(name: string, value: number): void { }
}

namespace basic {
    export function pause(ms: number): void { }
    // test.ts は失敗時に IconNames.No を表示する。それを終了コードに変換する
    export function showIcon(icon: IconNames): void {
        if (icon === IconNames.No) process.exitCode = 1
    }
    export function showNumber(n: number): void { }
    export function forever(body: () => void): void { }
}

namespace control {
    export function onEvent(src: number, value: number, handler: () => void): void { }
    export function raiseEvent(src: number, value: number): void { }
    export function eventValue(): number { return 0 }
    export function inBackground(body: () => void): void { }
}

namespace pins {
    export function analogReadPin(pin: AnalogPin): number { return 0 }
    export function analogWritePin(pin: AnalogPin, value: number): void { }
    export function analogSetPeriod(pin: AnalogPin, micros: number): void { }
    export function digitalWritePin(pin: DigitalPin, value: number): void { }
    export function touchSetMode(target: TouchTarget, mode: TouchTargetMode): void { }
}

namespace input {
    export function acceleration(dim: Dimension): number { return 0 }
    export function runningTime(): number { return 0 }
    export function onPinPressed(pin: TouchPin, handler: () => void): void { }
    export function onPinReleased(pin: TouchPin, handler: () => void): void { }
    export function onButtonPressed(button: Button, handler: () => void): void { }
}

namespace loops {
    export function everyInterval(ms: number, body: () => void): void { }
}

namespace radio {
    export function setGroup(g: number): void { }
    export function setTransmitPower(p: number): void { }
    export function sendValue(name: string, value: number): void { }
    export function onReceivedValue(handler: (name: string, value: number) => void): void { }
}

namespace power {
    export function fullPowerOn(src: FullPowerSource): void { }
    export function fullPowerEvery(ms: number, body: () => void): void { }
    export function lowPowerRequest(mode: LowPowerMode): void { }
}

namespace neopixel {
    export class Strip {
        setBrightness(b: number): void { }
        showColor(c: number): void { }
    }
    export function create(pin: DigitalPin, count: number, mode: NeoPixelMode): Strip {
        return new Strip()
    }
}
