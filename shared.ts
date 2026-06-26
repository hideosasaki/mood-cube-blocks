enum CubeFace {
    //% block="face 0"
    Face0 = 0,
    //% block="face 1"
    Face1 = 1,
    //% block="face 2"
    Face2 = 2,
    //% block="face 3"
    Face3 = 3,
    //% block="face 4"
    Face4 = 4,
    //% block="face 5"
    Face5 = 5
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
}
