//% color="#6A4C93" weight=207 icon="\uf0f3" block="キューブ振動"
namespace cubeVibe {
    let _initialized = false

    function init(): void {
        if (_initialized) return
        _initialized = true
        pins.analogSetPeriod(AnalogPin.P1, 1000)
    }

    // ERM振動モーターは低デューティで回り出せず、線形マッピングでは強さ1〜4が無振動になる。
    // 実測 (docs/measurements/2026-07-16-vibe-duty.txt, P1 PWM 1kHz):
    //   回転維持: 273で停止、298で急激に弱化、323以上で安定 → 下限DUTY_MINは323+1段(25)の348
    //   静止からの起動: 448が最小 → 温度・電池電圧の変動マージンを乗せ、KICK_UNDER未満で
    //   始動するときは静止摩擦を切るためKICK_MSだけ全開で回してから目標値に落とす
    const DUTY_MIN = 348
    const KICK_UNDER = 600
    const KICK_MS = 50

    let _running = false

    export function _strengthToDuty(strength: number): number {
        if (strength <= 0) return 0
        if (strength > 9) strength = 9
        return DUTY_MIN + Math.idiv((strength - 1) * (1023 - DUTY_MIN), 8)
    }

    export function _kickNeeded(running: boolean, duty: number): boolean {
        return !running && duty > 0 && duty < KICK_UNDER
    }

    function write(strength: number): void {
        init()
        const duty = _strengthToDuty(strength)
        if (duty === 0) {
            pins.digitalWritePin(DigitalPin.P1, 0)
            _running = false
            return
        }
        if (_kickNeeded(_running, duty)) {
            pins.analogWritePin(AnalogPin.P1, 1023)
            basic.pause(KICK_MS)
        }
        pins.analogWritePin(AnalogPin.P1, duty)
        _running = true
    }

    //% blockId=cubeVibe_pulse block="vibrate strength %strength for %ms ms"
    //% strength.min=0 strength.max=9 strength.defl=5
    //% ms.defl=200
    export function pulse(strength: number, ms: number): void {
        write(strength)
        basic.pause(ms)
        write(0)
    }

    //% blockId=cubeVibe_start block="start vibrating strength %strength"
    //% strength.min=0 strength.max=9 strength.defl=5
    export function start(strength: number): void {
        write(strength)
    }

    //% blockId=cubeVibe_stop block="stop vibrating"
    export function stop(): void {
        write(0)
    }

    // P1 はモータードライバのベースにつながる。放置するとハイインピーダンスのままで
    // ドライバ入力が不定になりモーターが回るため、ロード時に必ず LOW を書く
    pins.digitalWritePin(DigitalPin.P1, 0)
}
