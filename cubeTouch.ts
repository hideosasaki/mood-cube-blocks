//% color="#FF8C42" weight=210 icon="\uf25a" block="キューブ触感"
namespace cubeTouch {
    const SURFACE_SAMPLE_MS = 50
    const SURFACE_STABLE_MS = 150
    const ACCEL_NORM_MIN = 600
    const ACCEL_NORM_MAX = 1600
    const AXIS_DOMINANCE_MIN = 200

    // ピン刺し検知は適応参照値からの下振れ1サンプルで即発火する。状態 (刺さっている/抜けた) は
    // 持たない。根拠データは docs/measurements/2026-07-12-poke.json ほか
    const TOUCH_STUCK_EDGE = 50
    // 発火後はクリーンなサンプルが連続するまで再発火を封じる (再アーム)。刺している間の
    // 商用ノイズの揺れでは連続が成立せず、抜いて次を刺す動作では自然に成立する (2026-07-12実測)
    export const TOUCH_REARM_SAMPLES = 6
    const TOUCH_REF_DIV = 32
    export const TOUCH_WARMUP_SAMPLES = 9

    let _surface: CubeFace = CubeFace.Face1
    let _candidate: CubeFace = CubeFace.Face1
    let _candidateSince: number = 0
    let _initialized = false
    let _ref: number = -1
    let _cleanRun: number = 0
    let _stabCount: number = 0
    let _warmupBuf: number[] = []

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

    export function _isTouchSample(raw: number): boolean {
        return _ref >= 0 && raw < _ref - TOUCH_STUCK_EDGE
    }

    function _feedTouchSample(raw: number): void {
        if (_ref < 0) {
            // 電源投入の過渡やスイッチ操作時の手の接触が偽エッジの起点にならないよう、
            // 最初の数サンプルは検出せず中央値で参照値をシードする
            _warmupBuf.push(raw)
            if (_warmupBuf.length >= TOUCH_WARMUP_SAMPLES) {
                _ref = cubeInternal._medianInPlace(_warmupBuf)
                _warmupBuf = []
            }
            return
        }
        const dev = raw - _ref

        // 下振れの間は参照値を更新しない。信号に引き寄せられて感度が落ちるのを防ぐ
        if (dev < -TOUCH_STUCK_EDGE) {
            if (_cleanRun >= TOUCH_REARM_SAMPLES) {
                _stabCount++
                cubePower._markActive(input.runningTime())
                control.raiseEvent(cubeInternal.EVT_SRC_PIN_STUCK, _surface)
                cubePair._broadcastPin(_surface)
            }
            _cleanRun = 0
            return
        }

        _cleanRun++
        _ref += (raw - _ref) / TOUCH_REF_DIV
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

        // 面番号は雄サイコロ配置 (1・2・3の頂点で時計回り、対面の和7)。
        // 1=micro:bit裏面, 6=表面, 2=Bボタン側, 5=Aボタン側, 3=ロゴ側, 4=エッジコネクタ側。
        // 読み値は重力方向 (下向き) を指すので、上面は符号の逆側
        if (maxAxis === 0) return x > 0 ? CubeFace.Face5 : CubeFace.Face2
        if (maxAxis === 1) return y > 0 ? CubeFace.Face3 : CubeFace.Face4
        return z > 0 ? CubeFace.Face1 : CubeFace.Face6
    }

    export function _testResetTouch(): void {
        _ref = -1
        _cleanRun = 0
        _stabCount = 0
        _warmupBuf = []
    }

    export function _testStabCount(): number {
        return _stabCount
    }

    export function _testGetRef(): number {
        return _ref
    }

    export function _testFeedTouchSample(raw: number): void {
        _feedTouchSample(raw)
    }

    export function _localSurface(): CubeFace {
        return _surface
    }

    export function _raiseRemoteSurface(face: number): void {
        if (face < 1 || face > 6) return
        _surface = face
        cubePower._markActive(input.runningTime())
        control.raiseEvent(cubeInternal.EVT_SRC_SURFACE, face)
    }

    export function _raiseRemotePin(face: number): void {
        if (face < 1 || face > 6) return
        cubePower._markActive(input.runningTime())
        control.raiseEvent(cubeInternal.EVT_SRC_PIN_STUCK, face)
    }

    export function _raiseRemoteMotion(pickup: boolean): void {
        cubePower._markActive(input.runningTime())
        const src = pickup ? cubeInternal.EVT_SRC_TOUCH_PICKUP : cubeInternal.EVT_SRC_TOUCH_PUTDOWN
        control.raiseEvent(src, 0)
    }

}
