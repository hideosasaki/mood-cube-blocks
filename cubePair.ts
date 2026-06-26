//% color="#2A9D8F" weight=96 icon="" block="cube pair"
namespace cubePair {
    const REQ_TIMEOUT_MS = 80

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
    //% id.min=0 id.max=255 id.defl=42
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
        radio.setTransmitPower(7)
        radio.onReceivedValue(function (name: string, value: number) {
            onPacket(name, value)
        })
    }

    function onPacket(name: string, value: number): void {
        if (cubeInternal.role === cubeInternal.ROLE_UNSET) return
        if (name === "ts" && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemoteSurface(value)
        } else if (name === "tp" && cubeInternal.role === CubeRole.Grip) {
            cubeTouch._raiseRemotePin(Math.idiv(value, 10), (value % 10) === 1)
        } else if (name === "ge" && cubeInternal.role === CubeRole.Touch) {
            cubeGrip._raiseRemoteGripEvent(value)
        } else if (name === "qs" && cubeInternal.role === CubeRole.Touch) {
            radio.sendValue("rs", (value << 8) | cubeTouch._localSurface())
        } else if (name === "qg" && cubeInternal.role === CubeRole.Grip) {
            radio.sendValue("rg", (value << 8) | cubeGrip._localStrength())
        } else if (name === "rs" || name === "rg") {
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
        return request(CubeRole.Grip, "qs")
    }

    export function requestStrength(): number {
        return request(CubeRole.Touch, "qg")
    }

    export function _broadcastSurface(face: number): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        ensureRadio()
        radio.sendValue("ts", face)
    }

    export function _broadcastPin(face: number, stuck: boolean): void {
        if (cubeInternal.role !== CubeRole.Touch) return
        ensureRadio()
        radio.sendValue("tp", face * 10 + (stuck ? 1 : 0))
    }

    export function _broadcastGripEvent(src: number): void {
        if (cubeInternal.role !== CubeRole.Grip) return
        if (src < cubeInternal.EVT_SRC_GRIP_START || src > cubeInternal.EVT_SRC_GRIP_MAX_RELEASED) return
        ensureRadio()
        radio.sendValue("ge", src)
    }
}
