let _passed = 0
let _failed = 0
let _currentTest = ""

function assert(cond: boolean, msg: string): void {
    if (cond) {
        _passed++
    } else {
        _failed++
        serial.writeLine("  FAIL [" + _currentTest + "]: " + msg)
    }
}

function assertEq(actual: number, expected: number, msg: string): void {
    assert(actual === expected, msg + " (expected " + expected + ", got " + actual + ")")
}

function test(name: string, body: () => void): void {
    _currentTest = name
    serial.writeLine("TEST: " + name)
    body()
}

function runTests(): void {
    test("rawToStrength: at or below baseline returns 0", function () {
        assertEq(cubeGrip._rawToStrength(0), 0, "raw=0")
        assertEq(cubeGrip._rawToStrength(80), 0, "raw=80 (= baseline)")
    })

    test("rawToStrength: at or above RAW_FULL returns 9", function () {
        assertEq(cubeGrip._rawToStrength(900), 9, "raw=900")
        assertEq(cubeGrip._rawToStrength(1023), 9, "raw=1023")
    })

    test("rawToStrength: just above baseline clamped to 1", function () {
        assertEq(cubeGrip._rawToStrength(81), 1, "raw=81")
    })

    test("rawToStrength: midpoint maps to 5", function () {
        assertEq(cubeGrip._rawToStrength(490), 5, "raw=490")
    })

    test("rawToStrength: raw=217 maps to 2", function () {
        assertEq(cubeGrip._rawToStrength(217), 2, "raw=217")
    })

    test("hysteresis: 0 to 1 takes 3 stable samples", function () {
        cubeGrip._testResetState()
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStrength(), 0, "after 1st sample")
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStrength(), 0, "after 2nd sample")
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStrength(), 1, "after 3rd sample (commit)")
    })

    test("hysteresis: 1 to 2 takes 2 stable samples", function () {
        cubeGrip._testResetState()
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStrength(), 1, "setup: strength=1")
        cubeGrip._testFeedSample(217)
        assertEq(cubeGrip._testGetStrength(), 1, "after 1st rising sample")
        cubeGrip._testFeedSample(217)
        assertEq(cubeGrip._testGetStrength(), 2, "after 2nd rising sample (commit)")
    })

    test("hysteresis: 1 to 0 takes 4 stable samples (falling + crosses zero)", function () {
        cubeGrip._testResetState()
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStrength(), 1, "setup: strength=1")
        cubeGrip._testFeedSample(50)
        assertEq(cubeGrip._testGetStrength(), 1, "after 1st falling")
        cubeGrip._testFeedSample(50)
        assertEq(cubeGrip._testGetStrength(), 1, "after 2nd falling")
        cubeGrip._testFeedSample(50)
        assertEq(cubeGrip._testGetStrength(), 1, "after 3rd falling")
        cubeGrip._testFeedSample(50)
        assertEq(cubeGrip._testGetStrength(), 0, "after 4th falling (commit)")
    })

    test("hysteresis: candidate change resets stable counter", function () {
        cubeGrip._testResetState()
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(217)
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetCandidate(), 1, "candidate after flicker")
        assertEq(cubeGrip._testGetStableCount(), 1, "stable count reset")
        assertEq(cubeGrip._testGetStrength(), 0, "strength unchanged")
    })

    test("hysteresis: same-as-current sample clears candidate counter", function () {
        cubeGrip._testResetState()
        cubeGrip._testFeedSample(81)
        cubeGrip._testFeedSample(81)
        assertEq(cubeGrip._testGetStableCount(), 2, "ramping up")
        cubeGrip._testFeedSample(50)
        assertEq(cubeGrip._testGetStableCount(), 0, "raw maps to 0 = current strength, counter reset")
    })

    test("classifyAccel: norm below min returns 0", function () {
        assertEq(cubeTouch._classifyAccel(100, 100, 100), 0, "norm=300")
    })

    test("classifyAccel: norm above max returns 0", function () {
        assertEq(cubeTouch._classifyAccel(1000, 1000, 1000), 0, "norm=3000")
    })

    test("classifyAccel: insufficient dominance returns 0", function () {
        assertEq(cubeTouch._classifyAccel(400, 400, 400), 0, "equal axes")
    })

    test("classifyAccel: each dominant axis maps to expected face", function () {
        const xs = [0, 0, 1000, -1000, 0, 0]
        const ys = [0, 0, 0, 0, 1000, -1000]
        const zs = [1000, -1000, 0, 0, 0, 0]
        const faces = [CubeFace.Face6, CubeFace.Face1, CubeFace.Face3, CubeFace.Face4, CubeFace.Face2, CubeFace.Face5]
        for (let i = 0; i < xs.length; i++) {
            assertEq(cubeTouch._classifyAccel(xs[i], ys[i], zs[i]), faces[i], "case " + i)
        }
    })

    test("encode/decode pin: stuck=true", function () {
        const v = cubePair._encodePin(3, true)
        assertEq(cubePair._decodePinFace(v), 3, "face round trip")
        assert(cubePair._decodePinStuck(v) === true, "stuck=true round trip")
    })

    test("encode/decode pin: stuck=false", function () {
        const v = cubePair._encodePin(6, false)
        assertEq(cubePair._decodePinFace(v), 6, "face round trip")
        assert(cubePair._decodePinStuck(v) === false, "stuck=false round trip")
    })

    test("encode/decode grip event: offset=0 strength=9", function () {
        const v = cubePair._encodeGripEvent(0, 9)
        assertEq(cubePair._decodeGripOffset(v), 0, "offset")
        assertEq(cubePair._decodeGripStrength(v), 9, "strength")
    })

    test("encode/decode grip event: offset=4 strength=1", function () {
        const v = cubePair._encodeGripEvent(4, 1)
        assertEq(cubePair._decodeGripOffset(v), 4, "offset")
        assertEq(cubePair._decodeGripStrength(v), 1, "strength")
    })

    test("encode/decode resp: id=255 payload=6", function () {
        const v = cubePair._encodeResp(255, 6)
        assertEq(cubePair._decodeRespId(v), 255, "id")
        assertEq(cubePair._decodeRespValue(v), 6, "payload")
    })

    test("encode/decode resp: id=0 payload=9", function () {
        const v = cubePair._encodeResp(0, 9)
        assertEq(cubePair._decodeRespId(v), 0, "id")
        assertEq(cubePair._decodeRespValue(v), 9, "payload")
    })
}

serial.writeLine("=== mood-cube-blocks tests ===")
runTests()
serial.writeLine("=== " + _passed + " passed, " + _failed + " failed ===")
if (_failed === 0) {
    basic.showIcon(IconNames.Yes)
} else {
    basic.showIcon(IconNames.No)
    basic.showNumber(_failed)
}
