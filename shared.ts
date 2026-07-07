enum CubeFace {
    //% block="face 1"
    Face1 = 1,
    //% block="face 2"
    Face2 = 2,
    //% block="face 3"
    Face3 = 3,
    //% block="face 4"
    Face4 = 4,
    //% block="face 5"
    Face5 = 5,
    //% block="face 6"
    Face6 = 6
}

enum CubeRole {
    //% block="touch cube"
    Touch = 1,
    //% block="grip cube"
    Grip = 2
}

namespace cubeInternal {
    export const ROLE_UNSET = 0
    export const DEFAULT_GROUP = 156

    export let role: number = ROLE_UNSET
    export let group: number = DEFAULT_GROUP

    export const EVT_SRC_SURFACE = 0xCB01
    export const EVT_SRC_PIN_STUCK = 0xCB02
    export const EVT_SRC_PIN_RELEASED = 0xCB03
    export const EVT_SRC_GRIP_START = 0xCB04
    export const EVT_SRC_GRIP_RELEASE = 0xCB05
    export const EVT_SRC_GRIP_MAX_REACHED = 0xCB06
    export const EVT_SRC_GRIP_MAX_RELEASED = 0xCB07
    export const EVT_SRC_GRIP_CHANGED = 0xCB08
    export const EVT_SRC_TOUCH_PICKUP = 0xCB09
    export const EVT_SRC_TOUCH_PUTDOWN = 0xCB0A
    export const EVT_SRC_GRIP_PICKUP = 0xCB0B
    export const EVT_SRC_GRIP_PUTDOWN = 0xCB0C
    export const EVT_SRC_MOTION_PICKUP = 0xCB0D
    export const EVT_SRC_MOTION_PUTDOWN = 0xCB0E

    export const MSG_TOUCH_SURFACE = "ts"
    export const MSG_TOUCH_PIN = "tp"
    export const MSG_GRIP_EVENT = "ge"
    export const MSG_TOUCH_MOTION = "tm"
    export const MSG_GRIP_MOTION = "gm"
    export const MSG_QUERY_SURFACE = "qs"
    export const MSG_QUERY_GRIP = "qg"
    export const MSG_RESP_SURFACE = "rs"
    export const MSG_RESP_GRIP = "rg"
    export const MSG_QUERY_PIN = "qp"
    export const MSG_RESP_PIN = "rp"

    export function _medianInPlace(samples: number[]): number {
        for (let i = 1; i < samples.length; i++) {
            const v = samples[i]
            let j = i - 1
            while (j >= 0 && samples[j] > v) {
                samples[j + 1] = samples[j]
                j--
            }
            samples[j + 1] = v
        }
        return samples[samples.length >> 1]
    }
}
