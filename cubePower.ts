namespace cubePower {
    const WAKE_DELTA_THRESHOLD = 30
    export const IDLE_TIMEOUT_MS = 180000

    let _wakeBaseline: number = -1
    let _lastActiveAt: number = 0

    export function _detectWakeFromAdc(raw: number): boolean {
        if (_wakeBaseline < 0) {
            _wakeBaseline = raw
            return false
        }
        const diff = raw - _wakeBaseline
        const absDiff = diff < 0 ? -diff : diff
        if (absDiff > WAKE_DELTA_THRESHOLD) return true
        _wakeBaseline = ((_wakeBaseline * 7) + raw) >> 3
        return false
    }

    export function _markActive(now: number): void {
        _lastActiveAt = now
    }

    export function _isIdle(now: number, timeoutMs: number): boolean {
        return now - _lastActiveAt >= timeoutMs
    }

    export function _testResetWakeBaseline(): void {
        _wakeBaseline = -1
    }

    export function _testGetWakeBaseline(): number {
        return _wakeBaseline
    }

    export function _testResetIdle(): void {
        _lastActiveAt = 0
    }

    export function _testGetLastActiveAt(): number {
        return _lastActiveAt
    }
}
