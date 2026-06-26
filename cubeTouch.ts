//% color="#FF8C42" weight=210 icon="\uf25a" block="キューブ触感"
namespace cubeTouch {
    const SURFACE_SAMPLE_MS = 50
    const PIN_SAMPLE_MS = 10
    const PIN_DEBOUNCE_MS = 20
    const SURFACE_STABLE_MS = 150
    const ACCEL_NORM_MIN = 600
    const ACCEL_NORM_MAX = 1600
    const AXIS_DOMINANCE_MIN = 200

    let _surface: CubeFace = CubeFace.Face1
    let _candidate: CubeFace = CubeFace.Face1
    let _candidateSince: number = 0
    let _initialized = false
    let _pinState = 1
    let _lastEdgeTime = 0

    //% blockId=cubeTouch_surface block="surface"
    export function surface(): number {
        if (cubeInternal.role === CubeRole.Touch) return _surface
        if (cubeInternal.role === CubeRole.Grip) return cubePair.requestSurface()
        return CubeFace.Face1
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
        pins.setPull(DigitalPin.P0, PinPullMode.PullUp)
        _pinState = pins.digitalReadPin(DigitalPin.P0)

        loops.everyInterval(SURFACE_SAMPLE_MS, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            updateSurface()
        })
        loops.everyInterval(PIN_SAMPLE_MS, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            updatePin()
        })
    }

    function updateSurface(): void {
        const x = input.acceleration(Dimension.X)
        const y = input.acceleration(Dimension.Y)
        const z = input.acceleration(Dimension.Z)
        const ax = Math.abs(x)
        const ay = Math.abs(y)
        const az = Math.abs(z)
        const norm = ax + ay + az
        if (norm < ACCEL_NORM_MIN || norm > ACCEL_NORM_MAX) return

        let maxAxis = 0
        let maxVal = ax
        if (ay > maxVal) { maxAxis = 1; maxVal = ay }
        if (az > maxVal) { maxAxis = 2; maxVal = az }

        let second = 0
        if (maxAxis === 0) second = ay > az ? ay : az
        else if (maxAxis === 1) second = ax > az ? ax : az
        else second = ax > ay ? ax : ay
        if (maxVal - second < AXIS_DOMINANCE_MIN) return

        let candidate = CubeFace.Face1
        if (maxAxis === 0) candidate = x > 0 ? CubeFace.Face3 : CubeFace.Face4
        else if (maxAxis === 1) candidate = y > 0 ? CubeFace.Face2 : CubeFace.Face5
        else candidate = z > 0 ? CubeFace.Face6 : CubeFace.Face1

        const now = input.runningTime()
        if (candidate !== _candidate) {
            _candidate = candidate
            _candidateSince = now
            return
        }
        if (now - _candidateSince >= SURFACE_STABLE_MS && candidate !== _surface) {
            _surface = candidate
            control.raiseEvent(cubeInternal.EVT_SRC_SURFACE, _surface)
            cubePair._broadcastSurface(_surface)
        }
    }

    function updatePin(): void {
        const now = input.runningTime()
        if (now - _lastEdgeTime < PIN_DEBOUNCE_MS) return
        const v = pins.digitalReadPin(DigitalPin.P0)
        if (v === _pinState) return
        _pinState = v
        _lastEdgeTime = now
        if (v === 0) {
            control.raiseEvent(cubeInternal.EVT_SRC_PIN_STUCK, _surface)
            cubePair._broadcastPin(_surface, true)
        } else {
            control.raiseEvent(cubeInternal.EVT_SRC_PIN_RELEASED, _surface)
            cubePair._broadcastPin(_surface, false)
        }
    }

    export function _localSurface(): CubeFace {
        return _surface
    }

    export function _raiseRemoteSurface(face: number): void {
        if (face < 1 || face > 6) return
        _surface = face
        control.raiseEvent(cubeInternal.EVT_SRC_SURFACE, face)
    }

    export function _raiseRemotePin(face: number, stuck: boolean): void {
        if (face < 1 || face > 6) return
        const src = stuck ? cubeInternal.EVT_SRC_PIN_STUCK : cubeInternal.EVT_SRC_PIN_RELEASED
        control.raiseEvent(src, face)
    }
}
