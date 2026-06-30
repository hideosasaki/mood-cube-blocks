namespace cubePower {
    const WAKE_DELTA_THRESHOLD = 30

    let _wakeBaseline: number = -1

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

    export function _testResetWakeBaseline(): void {
        _wakeBaseline = -1
    }

    export function _testGetWakeBaseline(): number {
        return _wakeBaseline
    }
}
