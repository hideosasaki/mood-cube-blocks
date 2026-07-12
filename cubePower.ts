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
    // 誤起床の再スリープ判定前に、PICKUP確定に要するトリガー窓+確認窓が
    // 完走できる観測時間を与える
    const WAKE_SETTLE_MS = ACTIVE_SAMPLE_MS * MOTION_WINDOW_TICKS * 2 + 50
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
    let _pickupArmed = false
    let _stillBegan = 0
    let _windowMax = 0
    let _windowTick = 0
    let _sleeping = false
    let _pendingPickup = false

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

    // fullPowerEveryの周期タイマー (WAKEUPフラグ付き) でもdeepSleepは復帰する。
    // 起床理由が実活動 (モーション/タッチ→センサーループが_markActive、
    // ボタン→押下状態を直接確認) でない限り再スリープする。
    // deepSleepは表示バッファもオーディオも保持するため、無効化せずに
    // 周期wakeを迎えると直前の表示が再点灯しポップ音が鳴る
    function enterSleep(): void {
        cubeLight.setColor(NeoPixelColors.Black)
        cubeVibe.stop()
        cubeGrip._calibrate()
        led.enable(false)
        // スピーカーを切断しておくと、毎秒の周期wakeでCODALがオーディオPWMを
        // 再構築してもピンが再接続されず、突入・起床の各1回以外はポップ音が
        // 出ない。その各1回はCODAL内部処理によるもので、script層では消せない
        music.setBuiltInSpeakerEnabled(false)
        _sleeping = true
        while (_shouldEnterSleep(input.runningTime())) {
            // スリープをまたいでarm状態が残ると、起床後の最初の窓だけでPICKUPが
            // 確定してしまい衝撃フィルタが効かない
            _pickupArmed = false
            power.lowPowerRequest(LowPowerMode.Wait)
            if (input.buttonIsPressed(Button.A) || input.buttonIsPressed(Button.B)) {
                _markActive(input.runningTime())
            } else {
                basic.pause(WAKE_SETTLE_MS)
            }
        }
        _sleeping = false
        music.setBuiltInSpeakerEnabled(true)
        led.enable(true)
        if (_pendingPickup) {
            _pendingPickup = false
            control.raiseEvent(cubeInternal.EVT_SRC_MOTION_PICKUP, 0)
        }
    }

    // 加速度はactiveMotionLoopだけが読む。ここでも読むと_accelDiffの基準値を
    // 食い合い、スリープ起床直後の大差分 (PICKUPの唯一の信号) を先に消費して
    // PICKUPイベントが出たり出なかったりする。手持ち中の覚醒維持は
    // _isMoving (PICKUP〜PUTDOWN間) で行う
    function periodicCheck(): void {
        if (_isMoving) {
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
                if (_sleeping) {
                    // 出力復元前にアプリのハンドラが走ると音が欠けるので、
                    // enterSleepの復元後に発火を持ち越す
                    _pendingPickup = true
                } else {
                    control.raiseEvent(cubeInternal.EVT_SRC_MOTION_PICKUP, 0)
                }
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

    // 机への衝撃 (ものを置く等) は1窓のスパイクで終わり、実際の持ち上げは動きが
    // 数窓続く (実測: docs/measurements/2026-07-13-motion-events.csv)。大差分の
    // 窓だけではPICKUPを発火せず、次の窓でも動きが続いたときだけ発火する
    export function _stepMotion(diff: number, now: number): number {
        if (diff >= STILL_THRESHOLD) {
            _stillBegan = 0
            if (!_isMoving) {
                if (_pickupArmed) {
                    _pickupArmed = false
                    _isMoving = true
                    return MOTION_EVT_PICKUP
                }
                _pickupArmed = diff > MOTION_THRESHOLD
            }
            return MOTION_EVT_NONE
        }
        _pickupArmed = false
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
        _pickupArmed = false
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
