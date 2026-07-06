//% color="#FF8C42" weight=210 icon="\uf25a" block="キューブ触感"
namespace cubeTouch {
    const SURFACE_SAMPLE_MS = 50
    const SURFACE_STABLE_MS = 150
    const ACCEL_NORM_MIN = 600
    const ACCEL_NORM_MAX = 1600
    const AXIS_DOMINANCE_MIN = 200

    // ピン刺し検知はアナログ振幅方式。根拠データは docs/measurements/2026-07-06-*.json
    const TOUCH_WINDOW = 20
    const TOUCH_STUCK_DELTA = 80
    const TOUCH_RELEASE_DELTA = 50
    const TOUCH_STUCK_CONFIRM = 2
    const BASELINE_SAMPLES = 6
    const BASELINE_INTERVAL_MS = 50
    const BASELINE_SPREAD_MAX = 50

    let _surface: CubeFace = CubeFace.Face1
    let _candidate: CubeFace = CubeFace.Face1
    let _candidateSince: number = 0
    let _initialized = false
    let _pinStuck: boolean = false
    let _baseline: number = -1
    let _ring: number[] = []
    let _deepCount: number = 0

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

    //% blockId=cubeTouch_onPickUp block="on picked up"
    export function onPickUp(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_TOUCH_PICKUP, 0, handler)
    }

    //% blockId=cubeTouch_onPutDown block="on put down"
    export function onPutDown(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_TOUCH_PUTDOWN, 0, handler)
    }

    export function _initAsTouch(): void {
        if (_initialized) return
        _initialized = true
        _calibrate()

        loops.everyInterval(SURFACE_SAMPLE_MS, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            updateSurface()
            _feedTouchSample(pins.analogReadPin(AnalogPin.P0))
        })
        control.onEvent(cubeInternal.EVT_SRC_MOTION_PICKUP, 0, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            control.raiseEvent(cubeInternal.EVT_SRC_TOUCH_PICKUP, 0)
            cubePair._broadcastTouchMotion(true)
        })
        control.onEvent(cubeInternal.EVT_SRC_MOTION_PUTDOWN, 0, function () {
            if (cubeInternal.role !== CubeRole.Touch) return
            control.raiseEvent(cubeInternal.EVT_SRC_TOUCH_PUTDOWN, 0)
            cubePair._broadcastTouchMotion(false)
        })
    }

    export function _calibrate(): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        const samples: number[] = []
        for (let i = 0; i < BASELINE_SAMPLES; i++) {
            samples.push(pins.analogReadPin(AnalogPin.P0))
            basic.pause(BASELINE_INTERVAL_MS)
        }
        _applyTouchCalibration(samples)
    }

    export function _applyTouchCalibration(samples: number[]): void {
        for (let i = 1; i < samples.length; i++) {
            const v = samples[i]
            let j = i - 1
            while (j >= 0 && samples[j] > v) {
                samples[j + 1] = samples[j]
                j--
            }
            samples[j + 1] = v
        }
        const median = samples[samples.length >> 1]
        const spread = samples[samples.length - 1] - samples[0]
        if (spread > BASELINE_SPREAD_MAX) return
        _baseline = median
    }

    export function _isTouchSample(raw: number): boolean {
        return _baseline >= 0 && raw < _baseline - TOUCH_STUCK_DELTA
    }

    function _feedTouchSample(raw: number): void {
        if (_ring.length < TOUCH_WINDOW) {
            _ring.push(raw)
        } else {
            _ring.shift()
            _ring.push(raw)
        }
        if (_baseline < 0) return

        if (!_pinStuck) {
            if (raw < _baseline - TOUCH_STUCK_DELTA) {
                _deepCount++
                if (_deepCount >= TOUCH_STUCK_CONFIRM) {
                    _deepCount = 0
                    _pinStuck = true
                    cubePower._markActive(input.runningTime())
                    control.raiseEvent(cubeInternal.EVT_SRC_PIN_STUCK, _surface)
                    cubePair._broadcastPin(_surface, true)
                }
            } else {
                _deepCount = 0
            }
            return
        }

        if (_ring.length < TOUCH_WINDOW) return
        let windowMin = _ring[0]
        for (let i = 1; i < _ring.length; i++) {
            if (_ring[i] < windowMin) windowMin = _ring[i]
        }
        if (windowMin > _baseline - TOUCH_RELEASE_DELTA) {
            _pinStuck = false
            cubePower._markActive(input.runningTime())
            control.raiseEvent(cubeInternal.EVT_SRC_PIN_RELEASED, _surface)
            cubePair._broadcastPin(_surface, false)
        }
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

    export function _testResetTouch(): void {
        _baseline = -1
        _ring = []
        _deepCount = 0
        _pinStuck = false
    }

    export function _testGetBaseline(): number {
        return _baseline
    }

    export function _testFeedTouchSample(raw: number): void {
        _feedTouchSample(raw)
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

    export function _raiseRemoteMotion(pickup: boolean): void {
        cubePower._markActive(input.runningTime())
        const src = pickup ? cubeInternal.EVT_SRC_TOUCH_PICKUP : cubeInternal.EVT_SRC_TOUCH_PUTDOWN
        control.raiseEvent(src, 0)
    }

}
