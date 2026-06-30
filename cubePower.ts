namespace cubePower {
    const MOTION_THRESHOLD = 200
    const PERIODIC_WAKE_MS = 1000
    export const IDLE_TIMEOUT_MS = 180000

    let _lastActiveAt: number = 0
    let _beaconUntil: number = 0
    let _initialized = false
    let _lastAccelX: number = 0
    let _lastAccelY: number = 0
    let _lastAccelZ: number = 0
    let _accelInitialized = false

    export function _init(): void {
        if (_initialized) return
        _initialized = true

        power.fullPowerOn(FullPowerSource.A)
        power.fullPowerOn(FullPowerSource.B)
        power.fullPowerOn(FullPowerSource.P0)

        power.fullPowerEvery(PERIODIC_WAKE_MS, function () {
            periodicCheck()
        })
    }

    function periodicCheck(): void {
        const x = input.acceleration(Dimension.X)
        const y = input.acceleration(Dimension.Y)
        const z = input.acceleration(Dimension.Z)
        if (_detectMotion(x, y, z)) {
            _markActive(input.runningTime())
        }
    }

    export function _detectMotion(x: number, y: number, z: number): boolean {
        if (!_accelInitialized) {
            _lastAccelX = x
            _lastAccelY = y
            _lastAccelZ = z
            _accelInitialized = true
            return false
        }
        const dx = Math.abs(x - _lastAccelX)
        const dy = Math.abs(y - _lastAccelY)
        const dz = Math.abs(z - _lastAccelZ)
        _lastAccelX = x
        _lastAccelY = y
        _lastAccelZ = z
        return dx + dy + dz > MOTION_THRESHOLD
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

    export function _testResetMotion(): void {
        _accelInitialized = false
        _lastAccelX = 0
        _lastAccelY = 0
        _lastAccelZ = 0
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
