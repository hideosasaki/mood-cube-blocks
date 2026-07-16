//% color="#2A9D8F" weight=206 icon="\uf0c1" block="キューブペア"
namespace cubePair {
    const REQ_TIMEOUT_MS = 80
    const RADIO_POWER_MAX = 7

    let _pendingReq: number = -1
    let _pendingResp: number = -1
    let _reqSeq: number = 0
    let _radioInit = false

    //% blockId=cubePair_setRole block="this cube is %role"
    export function setRole(role: CubeRole): void {
        cubeInternal.role = role
        pins.setAudioPinEnabled(false)
        ensureRadio()
        if (role === CubeRole.Touch) cubeTouch._initAsTouch()
        else if (role === CubeRole.Grip) cubeGrip._initAsGrip()
        cubePower._init()
    }

    //% blockId=cubePair_setGroup block="set pair group %id"
    //% id.min=0 id.max=255 id.defl=156
    export function setGroup(id: number): void {
        if (id < 0) id = 0
        if (id > 255) id = 255
        cubeInternal.group = id
        if (_radioInit) radio.setGroup(id)
    }

    function ensureRadio(): void {
        if (_radioInit) return
        _radioInit = true
        radio.setGroup(cubeInternal.group)
        radio.setTransmitPower(RADIO_POWER_MAX)
        radio.onReceivedValue(function (name: string, value: number) {
            onPacket(name, value)
        })
    }

    // 相手はスリープ中1秒周期wakeのlistenでしか聞いていないので、1周期を超える時間
    // 連投することでクロック同期なしに必ず届く
    const BEACON_DURATION_MS = 1200
    const BEACON_INTERVAL_MS = 50

    // 受信側の重複排除。ビーコンは同一イベントを BEACON_DURATION_MS 間連投するため、
    // 同名+同値のパケットは最初の受理から DEDUP_WINDOW_MS の間は再受理しない。
    // 窓は連投時間 + 電波の遅延余裕。受理時刻起点の固定窓 (再着で延長しない)
    // なので、窓の内に始まった同値の新イベントもビーコン後半のパケットで受理される
    const DEDUP_WINDOW_MS = BEACON_DURATION_MS + 300

    let _dedupNames: string[] = []
    let _dedupValues: number[] = []
    let _dedupTimes: number[] = []

    export function _acceptBeacon(name: string, value: number, now: number): boolean {
        const idx = _dedupNames.indexOf(name)
        if (idx < 0) {
            _dedupNames.push(name)
            _dedupValues.push(value)
            _dedupTimes.push(now)
            return true
        }
        if (_dedupValues[idx] === value && now - _dedupTimes[idx] < DEDUP_WINDOW_MS) {
            return false
        }
        _dedupValues[idx] = value
        _dedupTimes[idx] = now
        return true
    }

    export function _testResetDedup(): void {
        _dedupNames = []
        _dedupValues = []
        _dedupTimes = []
    }

    // 重複排除の対象は「クエリ/レスポンス以外すべて」。ビーコン連投されるメッセージを
    // 列挙する形にすると、追加時の列挙漏れが多重発火として静かに再発する。除外側の
    // 漏れ (新しいクエリが畳まれる) はテストで即座に気づけるので、こちらを既定にする
    function isRequestResponse(name: string): boolean {
        return name === cubeInternal.MSG_QUERY_SURFACE
            || name === cubeInternal.MSG_QUERY_GRIP
            || name === cubeInternal.MSG_RESP_SURFACE
            || name === cubeInternal.MSG_RESP_GRIP
    }

    function onPacket(name: string, value: number): void {
        if (cubeInternal.role === cubeInternal.ROLE_UNSET) return
        if (!isRequestResponse(name) && !_acceptBeacon(name, value, input.runningTime())) return
        if (name === cubeInternal.MSG_TOUCH_SURFACE && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemoteSurface(value)
        } else if (name === cubeInternal.MSG_TOUCH_PIN && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemotePin(value)
        } else if (name === cubeInternal.MSG_GRIP_EVENT && cubeInternal.role === CubeRole.Touch) {
            cubeGrip._raiseRemoteGripEvent(cubeInternal.EVT_SRC_GRIP_START + _decodeGripOffset(value), _decodeGripStrength(value))
        } else if (name === cubeInternal.MSG_TOUCH_MOTION && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemoteMotion(value === 1)
        } else if (name === cubeInternal.MSG_GRIP_MOTION && cubeInternal.role === CubeRole.Touch) {
            cubeGrip._raiseRemoteMotion(value === 1)
        } else if (name === cubeInternal.MSG_QUERY_SURFACE && cubeInternal.role === CubeRole.Touch) {
            radio.sendValue(cubeInternal.MSG_RESP_SURFACE, _encodeResp(value, cubeTouch._localSurface()))
        } else if (name === cubeInternal.MSG_QUERY_GRIP && cubeInternal.role === CubeRole.Grip) {
            radio.sendValue(cubeInternal.MSG_RESP_GRIP, _encodeResp(value, cubeGrip._localStrength()))
        } else if (name === cubeInternal.MSG_RESP_SURFACE || name === cubeInternal.MSG_RESP_GRIP) {
            if (_decodeRespId(value) === _pendingReq) {
                _pendingResp = _decodeRespValue(value)
            }
        }
    }

    export function _encodeGripEvent(offset: number, strength: number): number {
        return (offset << 4) | (strength & 0x0f)
    }

    export function _decodeGripOffset(value: number): number {
        return value >> 4
    }

    export function _decodeGripStrength(value: number): number {
        return value & 0x0f
    }

    export function _encodeResp(id: number, payload: number): number {
        return (id << 8) | (payload & 0xff)
    }

    export function _decodeRespId(value: number): number {
        return value >> 8
    }

    export function _decodeRespValue(value: number): number {
        return value & 0xff
    }

    function request(requiredRole: CubeRole, queryName: string): number {
        if (cubeInternal.role !== requiredRole) return 0
        ensureRadio()
        const id = (_reqSeq + 1) & 0xff
        _reqSeq = id
        _pendingReq = id
        _pendingResp = -1
        radio.sendValue(queryName, id)
        const deadline = input.runningTime() + REQ_TIMEOUT_MS
        while (input.runningTime() < deadline) {
            if (_pendingResp !== -1) {
                const r = _pendingResp
                _pendingReq = -1
                return r
            }
            basic.pause(5)
        }
        _pendingReq = -1
        return 0
    }

    export function requestSurface(): number {
        return request(CubeRole.Grip, cubeInternal.MSG_QUERY_SURFACE)
    }

    export function requestStrength(): number {
        return request(CubeRole.Touch, cubeInternal.MSG_QUERY_GRIP)
    }

    function broadcastWithBeacon(name: string, value: number): void {
        ensureRadio()
        const start = input.runningTime()
        cubePower._startBeacon(start, BEACON_DURATION_MS)
        control.inBackground(function () {
            const end = start + BEACON_DURATION_MS
            while (input.runningTime() < end) {
                radio.sendValue(name, value)
                basic.pause(BEACON_INTERVAL_MS)
            }
        })
    }

    export function _broadcastSurface(face: number): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        broadcastWithBeacon(cubeInternal.MSG_TOUCH_SURFACE, face)
    }

    export function _broadcastPin(face: number): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        broadcastWithBeacon(cubeInternal.MSG_TOUCH_PIN, face)
    }

    export function _broadcastGripEvent(src: number, strength: number): void {
        if (cubeInternal.role !== CubeRole.Grip) return
        if (src < cubeInternal.EVT_SRC_GRIP_START || src > cubeInternal.EVT_SRC_GRIP_CHANGED) return
        broadcastWithBeacon(cubeInternal.MSG_GRIP_EVENT, _encodeGripEvent(src - cubeInternal.EVT_SRC_GRIP_START, strength))
    }

    export function _broadcastTouchMotion(pickup: boolean): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        broadcastWithBeacon(cubeInternal.MSG_TOUCH_MOTION, pickup ? 1 : 0)
    }

    export function _broadcastGripMotion(pickup: boolean): void {
        if (cubeInternal.role !== CubeRole.Grip) return
        broadcastWithBeacon(cubeInternal.MSG_GRIP_MOTION, pickup ? 1 : 0)
    }
}
