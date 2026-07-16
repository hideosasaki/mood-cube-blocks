//% color="#E63946" weight=209 icon="\uf255" block="キューブ握り"
// 「握っていなければ強さ0」を3つの独立した機構で守る。
// 1. 時間ヒステリシス (processSample): 段差境界のサンプルノイズによる速い揺らぎを抑える
// 2. ピックアップゲート+置き中baseline追従 (_setPickedUp / feedWindow): 机置き中の
//    予圧ドリフトによる幽霊値・幽霊イベントを遮断し、置いている間に無圧点を較正する
// 3. 在手ゼロ点 (_handFloor): 「握らずに持っているだけ」の手の予圧は人・持ち方で毎回
//    違い、絶対値の定数では先回りできない。PICKUP以降に観測した6サンプル中央値の
//    最小をその持ち方のゼロ点とし、強さはそこからの相対値で量子化する。握り続ける限り
//    ゼロ点は上がらないので、長時間の握り込みは維持される。受容する限界: 置いた状態から
//    一度も緩めずに掴み上げて握り続けた場合、最初に緩めるまで強さが実際より低く出る
namespace cubeGrip {
    // 最終組み立て (LCX-300 3面巻き+布仕上げ+1MΩ分圧) の実測から決定。
    // docs/measurements/2026-07-16-assembled.json の rest-loosened (無圧103) /
    // max-loosened (全力p5=349)。デフォルトbaselineは無圧+マージン20相当。
    // 使用者 (子供) の全力実測後にRAW_FULLを見直す
    const RAW_ZERO_MAX_DEFAULT = 125
    const RAW_FULL = 349
    const BASELINE_SAMPLES = 6
    const BASELINE_MARGIN = 20

    let _strength: number = 0
    let _initialized = false
    let _rawZeroMax = RAW_ZERO_MAX_DEFAULT
    let _candidate: number = 0
    let _stableCount: number = 0
    // 持ち上げ状態 (MOTION_PICKUP〜PUTDOWN間)。フォーム巻きの予圧は数時間で数十counts
    // 締まる方向にドリフトする (docs/measurements/2026-07-16-rest-drift.json: 無圧が
    // 半日で103→144)。置かれている間のrawは定義上すべて無握りなので、この間は強さ判定を
    // 止めてbaselineを追従させる。起動直後は「置かれている」扱い。手の中で起動した場合も
    // 最初の動きでPICKUPが出るまでの間だけ判定が眠る
    let _pickedUp = false
    // 追従用の固定バッファ。毎回の再確保を避けるため長さ6を使い回し、_trackLenが充填数。
    // _applyCalibrationのソートで中身が壊れても次の充填で全上書きされるので問題ない
    let _trackBuf: number[] = [0, 0, 0, 0, 0, 0]
    let _trackLen = 0
    // 在手ゼロ点。-1は未確立 (最初の窓が完了するまで強さ判定を凍結する。持ち上げた
    // 瞬間の掴み力をゼロ点や強さとして誤採用しないため)
    let _handFloor = -1
    // 強さ変化イベントの最新値保証。DropIfBusy登録 (shared.ts) なのでハンドラ実行中の
    // 変化イベントは捨てられる。中間値の合流は望む挙動だが、最後の変化まで落ちると
    // アプリ層が古い強さのまま止まるので、ハンドラへ最後に渡した値 (_notified) と
    // _strengthがずれている間はサンプル周期で再発火する。実行中の再発火はDropIfBusyが
    // 捨てるので溜まらず、ハンドラが空いた次のtickで最新値だけが1回届く。
    // ハンドラ完了駆動 (ラッパー末尾での再raise) にしない理由: 実行中の自己raiseは
    // DropIfBusyが自分に捨てるので保証にならない。ポーリングはサンプラー駆動なので
    // 再発火はローカル限定。ペア相手で受ける遠隔CHANGEDはこの保証の対象外 (requirements参照)
    let _notified = 0
    let _changeRegistered = false

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
        _changeRegistered = true
        control.onEvent(cubeInternal.EVT_SRC_GRIP_CHANGED, 0, function () {
            const v = control.eventValue()
            // 再発火とコミット時の即時発火が重なっても同値の二重配達はここで抑える
            if (_deliverChange(v)) handler(v)
        }, cubeInternal.USER_HANDLER_FLAGS)
    }

    export function _deliverChange(v: number): boolean {
        if (v === _notified) return false
        _notified = v
        return true
    }

    export function _redeliverPending(): boolean {
        return _changeRegistered && _notified !== _strength
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
            _setPickedUp(true)
            control.raiseEvent(cubeInternal.EVT_SRC_GRIP_PICKUP, 0)
            cubePair._broadcastGripMotion(true)
        })
        control.onEvent(cubeInternal.EVT_SRC_MOTION_PUTDOWN, 0, function () {
            if (cubeInternal.role !== CubeRole.Grip) return
            _setPickedUp(false)
            control.raiseEvent(cubeInternal.EVT_SRC_GRIP_PUTDOWN, 0)
            cubePair._broadcastGripMotion(false)
        })
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
        // 在手中はその持ち方のゼロ点、それ以外 (未確立・テスト直呼び) は無圧baseline
        const zero = _handFloor >= 0 ? _handFloor + BASELINE_MARGIN : _rawZeroMax
        if (raw <= zero) return 0
        if (raw >= RAW_FULL) return 9
        const span = RAW_FULL - zero
        const v = Math.idiv((raw - zero) * 9 + (span >> 1), span)
        if (v < 1) return 1
        if (v > 9) return 9
        return v
    }

    function sampleOnce(): void {
        processSample(pins.analogReadPin(AnalogPin.P0))
    }

    // 置き状態→持ち上げでは残っている判定途中の状態を捨てる。持ち上げ→置きでは
    // 強さを即0に落とす (置く動作は物理的に握りの解放を伴う。幽霊値もここで消える)
    export function _setPickedUp(picked: boolean): void {
        if (_pickedUp === picked) return
        _pickedUp = picked
        _candidate = 0
        _stableCount = 0
        _trackLen = 0
        _handFloor = -1
        if (!picked && _strength > 0) {
            const prev = _strength
            _strength = 0
            emitTransitions(prev, 0)
        }
    }

    // 6サンプル (300ms) ごとの窓処理。置き中は無圧baselineの較正 (放置されれば常時
    // 働くので、スリープ突入時の一括較正は持たない。無圧が200を超えるまで締まった個体は
    // 追従が止まるが、そこまで来ると動作幅が残っていないので巻き直しが必要)。
    // 在手中は窓中央値の最小をゼロ点として追跡する (中央値なので離した直後の瞬間的な
    // 跳ね戻りではゼロ点が下がらない)
    function feedWindow(raw: number): void {
        _trackBuf[_trackLen++] = raw
        if (_trackLen < BASELINE_SAMPLES) return
        _trackLen = 0
        if (_pickedUp) {
            const m = cubeInternal._medianInPlace(_trackBuf)
            if (_handFloor < 0 || m < _handFloor) _handFloor = m
        } else {
            _applyCalibration(_trackBuf)
        }
    }

    function processSample(raw: number): void {
        feedWindow(raw)
        if (_redeliverPending()) {
            control.raiseEvent(cubeInternal.EVT_SRC_GRIP_CHANGED, _strength)
        }
        if (!_pickedUp || _handFloor < 0) return
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
        _pickedUp = true
        _trackLen = 0
        _notified = 0
        // 在手ゼロ点=デフォルトbaselineの状態から始める (従来テストの前提を保つ)
        _handFloor = RAW_ZERO_MAX_DEFAULT - BASELINE_MARGIN
    }

    export function _testGetHandFloor(): number {
        return _handFloor
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
