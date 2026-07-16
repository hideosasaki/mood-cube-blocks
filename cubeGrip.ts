//% color="#E63946" weight=209 icon="\uf255" block="キューブ握り"
namespace cubeGrip {
    // 最終組み立て (LCX-300 3面巻き+布仕上げ+1MΩ分圧) の実測から決定。
    // docs/measurements/2026-07-16-assembled.json の rest-loosened (無圧103) /
    // max-loosened (全力p5=349)。デフォルトbaselineは無圧+マージン20相当。
    // 使用者 (子供) の全力実測後にRAW_FULLを見直す
    const RAW_ZERO_MAX_DEFAULT = 125
    const RAW_FULL = 349
    const BASELINE_SAMPLES = 6
    const BASELINE_INTERVAL_MS = 50
    const BASELINE_MARGIN = 20

    let _strength: number = 0
    let _initialized = false
    let _rawZeroMax = RAW_ZERO_MAX_DEFAULT
    let _candidate: number = 0
    let _stableCount: number = 0

    //% blockId=cubeGrip_strength block="strength"
    export function strength(): number {
        if (cubeInternal.role === CubeRole.Grip) return _strength
        if (cubeInternal.role === CubeRole.Touch) return cubePair.requestStrength()
        return 0
    }

    //% blockId=cubeGrip_onGripStart block="on grip started"
    export function onGripStart(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_START, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onRelease block="on grip released"
    export function onRelease(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_RELEASE, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onMaxReached block="on max reached"
    export function onMaxReached(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_MAX_REACHED, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onMaxReleased block="on max released"
    export function onMaxReleased(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_MAX_RELEASED, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onChange block="on grip strength changed"
    //% draggableParameters="reporter"
    export function onChange(handler: (strength: number) => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_CHANGED, 0, function () {
            handler(control.eventValue())
        }, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onPickUp block="on picked up"
    export function onPickUp(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_PICKUP, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    //% blockId=cubeGrip_onPutDown block="on put down"
    export function onPutDown(handler: () => void): void {
        control.onEvent(cubeInternal.EVT_SRC_GRIP_PUTDOWN, 0, handler, cubeInternal.USER_HANDLER_FLAGS)
    }

    export function _initAsGrip(): void {
        if (_initialized) return
        _initialized = true
        startSampling()
        control.onEvent(cubeInternal.EVT_SRC_MOTION_PICKUP, 0, function () {
            if (cubeInternal.role !== CubeRole.Grip) return
            control.raiseEvent(cubeInternal.EVT_SRC_GRIP_PICKUP, 0)
            cubePair._broadcastGripMotion(true)
        })
        control.onEvent(cubeInternal.EVT_SRC_MOTION_PUTDOWN, 0, function () {
            if (cubeInternal.role !== CubeRole.Grip) return
            control.raiseEvent(cubeInternal.EVT_SRC_GRIP_PUTDOWN, 0)
            cubePair._broadcastGripMotion(false)
        })
    }

    // baseline較正はスリープ突入直前に行う (cubePowerから呼ばれる)。起動時は手に持っている
    // 可能性が高いのに対し、スリープ直前は無操作が続いた後なので無握りがほぼ確実。ドリフトで
    // 幽霊値 (無握りなのに強さ>=1) が出た個体も、放置されれば必ずスリープに到達して校正される。
    // 最初のスリープまではデフォルト値で動く
    export function _calibrate(): void {
        if (cubeInternal.role !== CubeRole.Grip) return
        const samples: number[] = []
        for (let i = 0; i < BASELINE_SAMPLES; i++) {
            samples.push(pins.analogReadPin(AnalogPin.P0))
            basic.pause(BASELINE_INTERVAL_MS)
        }
        _applyCalibration(samples)
    }

    export function _applyCalibration(samples: number[]): void {
        const median = cubeInternal._medianInPlace(samples)
        const spread = samples[samples.length - 1] - samples[0]
        // ばらつきが大きい、または値が高すぎる (握られている疑い) 場合は現在のbaselineを維持する
        if (spread > 100 || median > 200) return
        _rawZeroMax = median + BASELINE_MARGIN
    }

    function startSampling(): void {
        loops.everyInterval(50, function () {
            if (cubeInternal.role !== CubeRole.Grip) return
            sampleOnce()
        })
    }

    export function _isPressSample(raw: number): boolean {
        return raw > _rawZeroMax
    }

    export function _rawToStrength(raw: number): number {
        if (raw <= _rawZeroMax) return 0
        if (raw >= RAW_FULL) return 9
        const span = RAW_FULL - _rawZeroMax
        const v = Math.idiv((raw - _rawZeroMax) * 9 + (span >> 1), span)
        if (v < 1) return 1
        if (v > 9) return 9
        return v
    }

    function sampleOnce(): void {
        processSample(pins.analogReadPin(AnalogPin.P0))
    }

    function processSample(raw: number): void {
        const target = _rawToStrength(raw)
        if (target === _strength) {
            _stableCount = 0
            return
        }
        if (target !== _candidate) {
            _candidate = target
            _stableCount = 1
            return
        }
        _stableCount++
        const needed = target > _strength ? 2 : 3
        const crossesZero = (_strength === 0) !== (target === 0)
        const crossesMax = (_strength === 9) !== (target === 9)
        const required = (crossesZero || crossesMax) ? needed + 1 : needed
        if (_stableCount < required) return

        const prev = _strength
        _strength = target
        _stableCount = 0
        cubePower._markActive(input.runningTime())
        emitTransitions(prev, _strength)
    }

    function fire(src: number, strength: number): void {
        control.raiseEvent(src, strength)
        cubePair._broadcastGripEvent(src, strength)
    }

    function emitTransitions(prev: number, next: number): void {
        if (prev === 0 && next >= 1) fire(cubeInternal.EVT_SRC_GRIP_START, next)
        if (prev >= 1 && next === 0) fire(cubeInternal.EVT_SRC_GRIP_RELEASE, next)
        if (prev < 9 && next === 9) fire(cubeInternal.EVT_SRC_GRIP_MAX_REACHED, next)
        if (prev === 9 && next < 9) fire(cubeInternal.EVT_SRC_GRIP_MAX_RELEASED, next)
        fire(cubeInternal.EVT_SRC_GRIP_CHANGED, next)
    }

    export function _localStrength(): number {
        return _strength
    }

    export function _raiseRemoteGripEvent(src: number, strength: number): void {
        if (src < cubeInternal.EVT_SRC_GRIP_START || src > cubeInternal.EVT_SRC_GRIP_CHANGED) return
        cubePower._markActive(input.runningTime())
        control.raiseEvent(src, strength)
    }

    export function _raiseRemoteMotion(pickup: boolean): void {
        cubePower._markActive(input.runningTime())
        const src = pickup ? cubeInternal.EVT_SRC_GRIP_PICKUP : cubeInternal.EVT_SRC_GRIP_PUTDOWN
        control.raiseEvent(src, 0)
    }

    export function _testResetState(): void {
        _strength = 0
        _candidate = 0
        _stableCount = 0
        _rawZeroMax = RAW_ZERO_MAX_DEFAULT
    }

    export function _testGetRawZeroMax(): number {
        return _rawZeroMax
    }

    export function _testFeedSample(raw: number): void {
        processSample(raw)
    }

    export function _testGetStrength(): number {
        return _strength
    }

    export function _testGetCandidate(): number {
        return _candidate
    }

    export function _testGetStableCount(): number {
        return _stableCount
    }
}
