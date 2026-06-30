//% color="#FF8C42" weight=210 icon="\uf25a" block="キューブ触感"
namespace cubeTouch {
    const SURFACE_SAMPLE_MS = 50
    const SURFACE_STABLE_MS = 150
    const ACCEL_NORM_MIN = 600
    const ACCEL_NORM_MAX = 1600
    const AXIS_DOMINANCE_MIN = 200

    let _surface: CubeFace = CubeFace.Face1
    let _candidate: CubeFace = CubeFace.Face1
    let _candidateSince: number = 0
    let _initialized = false
    let _pinStuck: boolean = false

    //% blockId=cubeTouch_surface block="surface"
    export function surface(): number {
        if (cubeInternal.role === CubeRole.Touch) return _surface
        if (cubeInternal.role === CubeRole.Grip) return cubePair.requestSurface()
        return CubeFace.Face1
    }

    //% blockId=cubeTouch_pinStuck block="pin stuck"
    export function pinStuck(): boolean {
        if (cubeInternal.role === CubeRole.Touch) return _pinStuck
        if (cubeInternal.role === CubeRole.Grip) return cubePair.requestPinStuck()
        return false
    }

    //% blockId=cubeTouch_onSurfaceChange block="on surface changed"
    //% draggableParameters="reporter"
    export function onSurfaceChange(handler: (face: number) => void): void {
        control.onEvent(cubeInternal.EVT_SRC_SURFACE, 0, function () {
            handler(control.eventValue())
        })
    }

    //% blockId=cubeTouch_onPinStuck block="on pin stuck"
    //% draggableParameters="reporter"
    export function onPinStuck(handler: (face: number) => void): void {
        control.onEvent(cubeInternal.EVT_SRC_PIN_STUCK, 0, function () {
            handler(control.eventValue())
        })
    }

    //% blockId=cubeTouch_onPinReleased block="on pin released"
    //% draggableParameters="reporter"
    export function onPinReleased(handler: (face: number) => void): void {
        control.onEvent(cubeInternal.EVT_SRC_PIN_RELEASED, 0, function () {
            handler(control.eventValue())
        })
    }

    export function _initAsTouch(): void {
        if (_initialized) return
        _initialized = true
        pins.touchSetMode(TouchTarget.P0, TouchTargetMode.Capacitive)

        loops.everyInterval(SURFACE_SAMPLE_MS, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            updateSurface()
        })
        input.onPinPressed(TouchPin.P0, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            _pinStuck = true
            cubePower._markActive(input.runningTime())
            control.raiseEvent(cubeInternal.EVT_SRC_PIN_STUCK, _surface)
            cubePair._broadcastPin(_surface, true)
        })
        input.onPinReleased(TouchPin.P0, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            _pinStuck = false
            cubePower._markActive(input.runningTime())
            control.raiseEvent(cubeInternal.EVT_SRC_PIN_RELEASED, _surface)
            cubePair._broadcastPin(_surface, false)
        })
    }

    function updateSurface(): void {
        const candidate = _classifyAccel(input.acceleration(Dimension.X), input.acceleration(Dimension.Y), input.acceleration(Dimension.Z))
        if (candidate === 0) return

        const now = input.runningTime()
        if (candidate !== _candidate) {
            _candidate = candidate
            _candidateSince = now
            return
        }
        if (now - _candidateSince >= SURFACE_STABLE_MS && candidate !== _surface) {
            _surface = candidate
            cubePower._markActive(now)
            control.raiseEvent(cubeInternal.EVT_SRC_SURFACE, _surface)
            cubePair._broadcastSurface(_surface)
        }
    }

    export function _classifyAccel(x: number, y: number, z: number): number {
        const ax = Math.abs(x)
        const ay = Math.abs(y)
        const az = Math.abs(z)
        const norm = ax + ay + az
        if (norm < ACCEL_NORM_MIN || norm > ACCEL_NORM_MAX) return 0

        let maxAxis = 0
        let maxVal = ax
        if (ay > maxVal) { maxAxis = 1; maxVal = ay }
        if (az > maxVal) { maxAxis = 2; maxVal = az }

        let second = 0
        if (maxAxis === 0) second = ay > az ? ay : az
        else if (maxAxis === 1) second = ax > az ? ax : az
        else second = ax > ay ? ax : ay
        if (maxVal - second < AXIS_DOMINANCE_MIN) return 0

        if (maxAxis === 0) return x > 0 ? CubeFace.Face3 : CubeFace.Face4
        if (maxAxis === 1) return y > 0 ? CubeFace.Face2 : CubeFace.Face5
        return z > 0 ? CubeFace.Face6 : CubeFace.Face1
    }

    export function _localSurface(): CubeFace {
        return _surface
    }

    export function _localPinStuck(): boolean {
        return _pinStuck
    }

    export function _raiseRemoteSurface(face: number): void {
        if (face < 1 || face > 6) return
        _surface = face
        cubePower._markActive(input.runningTime())
        control.raiseEvent(cubeInternal.EVT_SRC_SURFACE, face)
    }

    export function _raiseRemotePin(face: number, stuck: boolean): void {
        if (face < 1 || face > 6) return
        _pinStuck = stuck
        cubePower._markActive(input.runningTime())
        const src = stuck ? cubeInternal.EVT_SRC_PIN_STUCK : cubeInternal.EVT_SRC_PIN_RELEASED
        control.raiseEvent(src, face)
    }

}
