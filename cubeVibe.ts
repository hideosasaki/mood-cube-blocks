//% color="#6A4C93" weight=97 icon="" block="cube vibe"
namespace cubeVibe {
    let _initialized = false

    function init(): void {
        if (_initialized) return
        _initialized = true
        pins.analogSetPeriod(AnalogPin.P1, 1000)
    }

    function write(strength: number): void {
        init()
        if (strength <= 0) {
            pins.digitalWritePin(DigitalPin.P1, 0)
            return
        }
        if (strength > 9) strength = 9
        pins.analogWritePin(AnalogPin.P1, Math.idiv(strength * 1023, 9))
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
}
