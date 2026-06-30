namespace cubePower {
    const WAKE_MARGIN = 30
    const PERIODIC_WAKE_MS = 1000
    export const IDLE_TIMEOUT_MS = 180000

    let _lastActiveAt: number = 0
    let _beaconUntil: number = 0
    let _initialized = false

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
        if (cubeInternal.role !== CubeRole.Grip) return
        const raw = pins.analogReadPin(AnalogPin.P0)
        if (raw > cubeGrip._getRawZeroMax() + WAKE_MARGIN) {
            _markActive(input.runningTime())
        }
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
