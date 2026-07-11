namespace cubePower {
    const MOTION_THRESHOLD = 200
    const PERIODIC_WAKE_MS = 1000
    // 静止判定は20msサンプリングの100ms窓最大値で行う。10Hzサンプリングだと
    // 手の微動作がエイリアスで消え、机置きと区別できない (2026-07-11実測)
    const ACTIVE_SAMPLE_MS = 20
    const MOTION_WINDOW_TICKS = 5
    // 自然な手持ちの微動作 (実測p95=92) はSTILL_THRESHOLD超えでタイマーを
    // リセットし続け、机置き (実測max=36) でだけ静止窓が完走する。
    // 根拠: docs/measurements/2026-07-11-motion-fast.json
    const STILL_THRESHOLD = 60
    const PUTDOWN_STILL_MS = 4000
    export const IDLE_TIMEOUT_MS = 180000

    export const MOTION_EVT_NONE = 0
    export const MOTION_EVT_PICKUP = 1
    export const MOTION_EVT_PUTDOWN = 2

    let _lastActiveAt: number = 0
    let _beaconUntil: number = 0
    let _initialized = false
    let _lastAccelX: number = 0
    let _lastAccelY: number = 0
    let _lastAccelZ: number = 0
    let _accelInitialized = false
    let _isMoving = false
    let _stillBegan = 0
    let _windowMax = 0
    let _windowTick = 0

    export function _init(): void {
        if (_initialized) return
        _initialized = true

        power.fullPowerOn(FullPowerSource.A)
        power.fullPowerOn(FullPowerSource.B)

        power.fullPowerEvery(PERIODIC_WAKE_MS, function () {
            periodicCheck()
        })

        control.inBackground(function () {
            sleepLoop()
        })

        control.inBackground(function () {
            activeMotionLoop()
        })
    }

    function sleepLoop(): void {
        while (true) {
            basic.pause(PERIODIC_WAKE_MS)
            if (_shouldEnterSleep(input.runningTime())) {
                enterSleep()
            }
        }
    }

    function enterSleep(): void {
        cubeLight.setColor(NeoPixelColors.Black)
        cubeVibe.stop()
        cubeGrip._calibrate()
        power.lowPowerRequest(LowPowerMode.Wait)
        _markActive(input.runningTime())
    }

    function periodicCheck(): void {
        const x = input.acceleration(Dimension.X)
        const y = input.acceleration(Dimension.Y)
        const z = input.acceleration(Dimension.Z)
        if (_detectMotion(x, y, z)) {
            _markActive(input.runningTime())
        }
        if (cubeInternal.role === CubeRole.Touch && cubeTouch._isTouchSample(pins.analogReadPin(AnalogPin.P0))) {
            _markActive(input.runningTime())
        } else if (cubeInternal.role === CubeRole.Grip && cubeGrip._isPressSample(pins.analogReadPin(AnalogPin.P0))) {
            _markActive(input.runningTime())
        }
    }

    export function _accelDiff(x: number, y: number, z: number): number {
        if (!_accelInitialized) {
            _lastAccelX = x
            _lastAccelY = y
            _lastAccelZ = z
            _accelInitialized = true
            return 0
        }
        const dx = Math.abs(x - _lastAccelX)
        const dy = Math.abs(y - _lastAccelY)
        const dz = Math.abs(z - _lastAccelZ)
        _lastAccelX = x
        _lastAccelY = y
        _lastAccelZ = z
        return dx + dy + dz
    }

    export function _detectMotion(x: number, y: number, z: number): boolean {
        return _accelDiff(x, y, z) > MOTION_THRESHOLD
    }

    export function _markActive(now: number): void {
        _lastActiveAt = now
    }

    export function _isIdle(now: number, timeoutMs: number): boolean {
        return now - _lastActiveAt >= timeoutMs
    }

    export function _startBeacon(now: number, durationMs: number): void {
        _beaconUntil = now + durationMs
    }

    export function _isBroadcastingBeacon(now: number): boolean {
        return now < _beaconUntil
    }

    export function _shouldEnterSleep(now: number): boolean {
        if (_isBroadcastingBeacon(now)) return false
        return _isIdle(now, IDLE_TIMEOUT_MS)
    }

    function activeMotionLoop(): void {
        while (true) {
            basic.pause(ACTIVE_SAMPLE_MS)
            if (cubeInternal.role === cubeInternal.ROLE_UNSET) continue
            const x = input.acceleration(Dimension.X)
            const y = input.acceleration(Dimension.Y)
            const z = input.acceleration(Dimension.Z)
            const diff = _accelDiff(x, y, z)
            const now = input.runningTime()
            const evt = _feedMotionSample(diff, now)
            if (evt === MOTION_EVT_PICKUP) {
                _markActive(now)
                control.raiseEvent(cubeInternal.EVT_SRC_MOTION_PICKUP, 0)
            } else if (evt === MOTION_EVT_PUTDOWN) {
                _markActive(now)
                control.raiseEvent(cubeInternal.EVT_SRC_MOTION_PUTDOWN, 0)
            }
        }
    }

    export function _feedMotionSample(diff: number, now: number): number {
        if (diff > _windowMax) _windowMax = diff
        _windowTick++
        if (_windowTick < MOTION_WINDOW_TICKS) return MOTION_EVT_NONE
        const evt = _stepMotion(_windowMax, now)
        _windowTick = 0
        _windowMax = 0
        return evt
    }

    export function _stepMotion(diff: number, now: number): number {
        if (diff >= STILL_THRESHOLD) {
            _stillBegan = 0
            if (!_isMoving && diff > MOTION_THRESHOLD) {
                _isMoving = true
                return MOTION_EVT_PICKUP
            }
            return MOTION_EVT_NONE
        }
        if (!_isMoving) return MOTION_EVT_NONE
        if (_stillBegan === 0) {
            _stillBegan = now
            return MOTION_EVT_NONE
        }
        if (now - _stillBegan >= PUTDOWN_STILL_MS) {
            _isMoving = false
            _stillBegan = 0
            return MOTION_EVT_PUTDOWN
        }
        return MOTION_EVT_NONE
    }

    export function _testResetMotion(): void {
        _accelInitialized = false
        _lastAccelX = 0
        _lastAccelY = 0
        _lastAccelZ = 0
    }

    export function _testResetMotionState(): void {
        _isMoving = false
        _stillBegan = 0
        _windowMax = 0
        _windowTick = 0
    }

    export function _testResetIdle(): void {
        _lastActiveAt = 0
    }

    export function _testGetLastActiveAt(): number {
        return _lastActiveAt
    }

    export function _testResetBeacon(): void {
        _beaconUntil = 0
    }
}
