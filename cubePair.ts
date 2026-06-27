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
        ensureRadio()
        if (role === CubeRole.Touch) cubeTouch._initAsTouch()
        else if (role === CubeRole.Grip) cubeGrip._initAsGrip()
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

    function onPacket(name: string, value: number): void {
        if (cubeInternal.role === cubeInternal.ROLE_UNSET) return
        if (name === cubeInternal.MSG_TOUCH_SURFACE && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemoteSurface(value)
        } else if (name === cubeInternal.MSG_TOUCH_PIN && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemotePin(Math.idiv(value, 10), (value % 10) === 1)
        } else if (name === cubeInternal.MSG_GRIP_EVENT && cubeInternal.role === CubeRole.Touch) {
            const offset = value >> 4
            const strength = value & 0x0f
            cubeGrip._raiseRemoteGripEvent(cubeInternal.EVT_SRC_GRIP_START + offset, strength)
        } else if (name === cubeInternal.MSG_QUERY_SURFACE && cubeInternal.role === CubeRole.Touch) {
            radio.sendValue(cubeInternal.MSG_RESP_SURFACE, (value << 8) | cubeTouch._localSurface())
        } else if (name === cubeInternal.MSG_QUERY_GRIP && cubeInternal.role === CubeRole.Grip) {
            radio.sendValue(cubeInternal.MSG_RESP_GRIP, (value << 8) | cubeGrip._localStrength())
        } else if (name === cubeInternal.MSG_QUERY_PIN && cubeInternal.role === CubeRole.Touch) {
            radio.sendValue(cubeInternal.MSG_RESP_PIN, (value << 8) | (cubeTouch._localPinStuck() ? 1 : 0))
        } else if (name === cubeInternal.MSG_RESP_SURFACE || name === cubeInternal.MSG_RESP_GRIP || name === cubeInternal.MSG_RESP_PIN) {
            if ((value >> 8) === _pendingReq) {
                _pendingResp = value & 0xff
            }
        }
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

    export function requestPinStuck(): boolean {
        return request(CubeRole.Grip, cubeInternal.MSG_QUERY_PIN) === 1
    }

    export function _broadcastSurface(face: number): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        ensureRadio()
        radio.sendValue(cubeInternal.MSG_TOUCH_SURFACE, face)
    }

    export function _broadcastPin(face: number, stuck: boolean): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        ensureRadio()
        radio.sendValue(cubeInternal.MSG_TOUCH_PIN, face * 10 + (stuck ? 1 : 0))
    }

    export function _broadcastGripEvent(src: number, strength: number): void {
        if (cubeInternal.role !== CubeRole.Grip) return
        if (src < cubeInternal.EVT_SRC_GRIP_START || src > cubeInternal.EVT_SRC_GRIP_CHANGED) return
        ensureRadio()
        const offset = src - cubeInternal.EVT_SRC_GRIP_START
        radio.sendValue(cubeInternal.MSG_GRIP_EVENT, (offset << 4) | (strength & 0x0f))
    }
}
