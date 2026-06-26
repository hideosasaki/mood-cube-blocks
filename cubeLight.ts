//% color="#FFD23F" weight=98 icon="" block="cube light"
namespace cubeLight {
    let _strip: neopixel.Strip = null
    let _color: number = NeoPixelColors.Black
    let _level: number = 9

    function strip(): neopixel.Strip {
        if (!_strip) {
            _strip = neopixel.create(DigitalPin.P2, 1, NeoPixelMode.RGB)
        }
        return _strip
    }

    function apply(): void {
        const s = strip()
        s.setBrightness(Math.idiv(_level * 255, 9))
        s.showColor(_color)
    }

    //% blockId=cubeLight_setColor block="set color %color=neopixel_colors"
    export function setColor(color: number): void {
        _color = color
        apply()
    }

    //% blockId=cubeLight_setBrightness block="set brightness %level"
    //% level.min=0 level.max=9 level.defl=5
    export function setBrightness(level: number): void {
        if (level < 0) level = 0
        if (level > 9) level = 9
        _level = level
        apply()
    }
}
