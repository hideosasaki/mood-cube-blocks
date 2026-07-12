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

function seedTouch(v: number): void {
    for (let i = 0; i < cubeTouch.TOUCH_WARMUP_SAMPLES; i++) {
        cubeTouch._testFeedTouchSample(v)
    }
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

    test("calibration: stable samples set baseline to median + margin", function () {
        cubeGrip._testResetState()
        cubeGrip._applyCalibration([100, 101, 102, 103, 104, 105])
        assertEq(cubeGrip._testGetRawZeroMax(), 123, "median 103 + margin 20")
    })

    test("calibration: unsorted samples are handled", function () {
        cubeGrip._testResetState()
        cubeGrip._applyCalibration([105, 100, 103, 101, 104, 102])
        assertEq(cubeGrip._testGetRawZeroMax(), 123, "same result as sorted input")
    })

    test("calibration: large spread keeps current baseline", function () {
        cubeGrip._testResetState()
        cubeGrip._applyCalibration([100, 101, 102, 103, 104, 105])
        cubeGrip._applyCalibration([0, 10, 20, 30, 40, 200])
        assertEq(cubeGrip._testGetRawZeroMax(), 123, "spread 200 > 100, keep current")
    })

    test("calibration: high median keeps current baseline", function () {
        cubeGrip._testResetState()
        cubeGrip._applyCalibration([100, 101, 102, 103, 104, 105])
        cubeGrip._applyCalibration([210, 210, 210, 211, 211, 211])
        assertEq(cubeGrip._testGetRawZeroMax(), 123, "median 211 > 200, keep current")
    })

    test("calibration: median exactly 200 is accepted", function () {
        cubeGrip._testResetState()
        cubeGrip._applyCalibration([195, 197, 199, 200, 201, 203])
        assertEq(cubeGrip._testGetRawZeroMax(), 220, "median 200 + margin 20")
    })

    test("calibration: raised baseline clears phantom strength", function () {
        cubeGrip._testResetState()
        assertEq(cubeGrip._rawToStrength(110), 1, "phantom strength before calibration")
        cubeGrip._applyCalibration([110, 110, 110, 110, 110, 110])
        assertEq(cubeGrip._rawToStrength(110), 0, "phantom cleared")
    })

    test("touch ref: seeded with warmup median at last warmup sample", function () {
        cubeTouch._testResetTouch()
        for (let i = 0; i < cubeTouch.TOUCH_WARMUP_SAMPLES - 1; i++) {
            cubeTouch._testFeedTouchSample(722)
            assertEq(cubeTouch._testGetRef(), -1, "still warming up (sample " + (i + 1) + ")")
        }
        cubeTouch._testFeedTouchSample(722)
        assertEq(cubeTouch._testGetRef(), 722, "seeded at last warmup sample")
        assert(cubeTouch._localPinStuck() === false, "seeding does not stick")
    })

    test("touch warmup: boot transient dips neither stick nor skew the seed", function () {
        cubeTouch._testResetTouch()
        const boot = [900, 570, 570, 722, 722, 722, 722, 722, 722]
        for (let i = 0; i < boot.length; i++) {
            cubeTouch._testFeedTouchSample(boot[i])
            assert(cubeTouch._localPinStuck() === false, "no stuck during warmup (sample " + (i + 1) + ")")
        }
        assertEq(cubeTouch._testGetRef(), 722, "median absorbs transient outliers")
        cubeTouch._testFeedTouchSample(700)
        cubeTouch._testFeedTouchSample(700)
        assert(cubeTouch._localPinStuck() === false, "stable after warmup")
    })

    test("touch warmup: wake check is false before seeding", function () {
        cubeTouch._testResetTouch()
        cubeTouch._testFeedTouchSample(722)
        cubeTouch._testFeedTouchSample(722)
        assert(cubeTouch._isTouchSample(0) === false, "no ref during warmup")
    })

    test("touch stuck: two down-edges within the window stick", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === false, "1st edge sample: not yet")
        // 接触が浅いと商用ノイズの下振れが間欠的にしか閾値を越えない (2026-07-12実測)。
        // 連続でなくても窓内 (10サンプル=500ms) に2回下振れがあれば刺さり確定
        for (let i = 0; i < 8; i++) {
            cubeTouch._testFeedTouchSample(722)
        }
        assert(cubeTouch._localPinStuck() === false, "baseline bounce keeps pending")
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === true, "2nd edge within window: stuck")
    })

    test("touch stuck: window expiry forgets the first edge", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(570)
        for (let i = 0; i < 10; i++) {
            cubeTouch._testFeedTouchSample(722)
        }
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === false, "window expired: counts as 1st edge again")
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === true, "consecutive pair still sticks")
    })

    test("touch stuck: shallow dip below edge threshold does not stick", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(690)
        cubeTouch._testFeedTouchSample(690)
        cubeTouch._testFeedTouchSample(690)
        assert(cubeTouch._localPinStuck() === false, "-32 is below the edge threshold")
    })

    test("touch: ref snaps to level on stuck edge, quick removal releases", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(570)
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === true, "setup: stuck")
        assertEq(cubeTouch._testGetRef(), 570, "ref snapped to stuck level")
        for (let i = 0; i < 19; i++) {
            cubeTouch._testFeedTouchSample(722)
        }
        assert(cubeTouch._localPinStuck() === true, "19 samples: not yet (release needs 20)")
        cubeTouch._testFeedTouchSample(722)
        assert(cubeTouch._localPinStuck() === false, "removal: up edge from snapped ref")
        assertEq(cubeTouch._testGetRef(), 722, "ref snapped back on release")
    })

    test("touch: baseline bounce while stuck does not release", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(570)
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === true, "setup: stuck")
        // 刺したままでも信号は最長650ms程度 (50ms周期で13サンプル) ベースラインへ
        // 戻り続けることがある (2026-07-11実測)。この揺り戻しで release しない
        for (let i = 0; i < 19; i++) {
            cubeTouch._testFeedTouchSample(720)
        }
        cubeTouch._testFeedTouchSample(575)
        cubeTouch._testFeedTouchSample(574)
        assert(cubeTouch._localPinStuck() === true, "19-sample bounce back filtered")
    })

    test("touch: slow decay while stuck does not release", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        cubeTouch._testFeedTouchSample(570)
        cubeTouch._testFeedTouchSample(570)
        assert(cubeTouch._localPinStuck() === true, "setup: stuck")
        let level = 570
        for (let i = 0; i < 1000; i++) {
            if (level < 666) level = level + 1 - (i % 10 === 0 ? 1 : 0)
            cubeTouch._testFeedTouchSample(level)
        }
        assert(cubeTouch._localPinStuck() === true, "decay toward baseline is not an up edge")
        for (let i = 0; i < 20; i++) {
            cubeTouch._testFeedTouchSample(722)
        }
        assert(cubeTouch._localPinStuck() === false, "real removal still releases after decay")
    })

    test("touch: slow drift while idle does not stick", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        let level = 722
        for (let i = 0; i < 2000; i++) {
            if (level > 622 && i % 2 === 0) level--
            cubeTouch._testFeedTouchSample(level)
        }
        assert(cubeTouch._localPinStuck() === false, "ref follows slow downward drift")
    })

    test("touch wake check: deep sample relative to ref", function () {
        cubeTouch._testResetTouch()
        seedTouch(722)
        assert(cubeTouch._isTouchSample(600) === true, "well below ref")
        assert(cubeTouch._isTouchSample(700) === false, "small dip")
    })

    test("touch wake check: unseeded returns false", function () {
        cubeTouch._testResetTouch()
        assert(cubeTouch._isTouchSample(0) === false, "no ref yet")
    })

    test("grip wake check: press sample relative to baseline", function () {
        cubeGrip._testResetState()
        assert(cubeGrip._isPressSample(81) === true, "above default baseline 80")
        assert(cubeGrip._isPressSample(80) === false, "at baseline")
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
        // 読み値は重力方向 (下向き)。z=-1000は画面が上 → 表面のface6が上面
        const xs = [0, 0, 1000, -1000, 0, 0]
        const ys = [0, 0, 0, 0, 1000, -1000]
        const zs = [1000, -1000, 0, 0, 0, 0]
        const faces = [CubeFace.Face1, CubeFace.Face6, CubeFace.Face5, CubeFace.Face2, CubeFace.Face4, CubeFace.Face3]
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

    test("motion: first reading establishes baseline, diff is zero", function () {
        cubePower._testResetMotion()
        assertEq(cubePower._accelDiff(100, 200, 1000), 0, "first reading never triggers")
    })

    test("motion: stable readings stay small", function () {
        cubePower._testResetMotion()
        cubePower._accelDiff(100, 200, 1000)
        assertEq(cubePower._accelDiff(105, 195, 1003), 13, "tiny noise")
        assertEq(cubePower._accelDiff(110, 190, 1005), 12, "still small")
    })

    test("motion: large change produces large diff", function () {
        cubePower._testResetMotion()
        cubePower._accelDiff(0, 0, 1024)
        assertEq(cubePower._accelDiff(0, 1024, 0), 2048, "axis flip: dx+dy+dz=2048")
    })

    test("motion: baseline tracks current value after each call", function () {
        cubePower._testResetMotion()
        cubePower._accelDiff(0, 0, 1024)
        cubePower._accelDiff(0, 1024, 0)
        assertEq(cubePower._accelDiff(0, 1024, 0), 0, "now stationary at new orientation")
    })

    test("idle: not idle within timeout window", function () {
        cubePower._testResetIdle()
        cubePower._markActive(1000)
        assert(cubePower._isIdle(1000, 5000) === false, "right after active")
        assert(cubePower._isIdle(4999, 5000) === false, "just before timeout")
    })

    test("idle: idle at and beyond timeout", function () {
        cubePower._testResetIdle()
        cubePower._markActive(1000)
        assert(cubePower._isIdle(6000, 5000) === true, "exactly at timeout (5000ms elapsed)")
        assert(cubePower._isIdle(10000, 5000) === true, "well past timeout")
    })

    test("idle: markActive resets the timer", function () {
        cubePower._testResetIdle()
        cubePower._markActive(1000)
        cubePower._markActive(4000)
        assert(cubePower._isIdle(8000, 5000) === false, "second markActive resets (8000-4000=4000 < 5000)")
        assert(cubePower._isIdle(9000, 5000) === true, "after new timeout (9000-4000=5000)")
    })

    test("idle: default timeout is 3 minutes", function () {
        assertEq(cubePower.IDLE_TIMEOUT_MS, 180000, "3 minutes in ms")
    })

    test("beacon: not broadcasting initially", function () {
        cubePower._testResetBeacon()
        assert(cubePower._isBroadcastingBeacon(0) === false, "before any start")
        assert(cubePower._isBroadcastingBeacon(10000) === false, "any later time")
    })

    test("beacon: active within duration", function () {
        cubePower._testResetBeacon()
        cubePower._startBeacon(1000, 1200)
        assert(cubePower._isBroadcastingBeacon(1000) === true, "right at start")
        assert(cubePower._isBroadcastingBeacon(2199) === true, "just before end (1000+1199)")
    })

    test("beacon: ends at duration boundary", function () {
        cubePower._testResetBeacon()
        cubePower._startBeacon(1000, 1200)
        assert(cubePower._isBroadcastingBeacon(2200) === false, "at end (1000+1200)")
        assert(cubePower._isBroadcastingBeacon(5000) === false, "well after")
    })

    test("sleep precondition: idle + no beacon = should sleep", function () {
        cubePower._testResetIdle()
        cubePower._testResetBeacon()
        cubePower._markActive(0)
        assert(cubePower._shouldEnterSleep(200000) === true, "idle past 3min")
    })

    test("sleep precondition: not idle = should not sleep", function () {
        cubePower._testResetIdle()
        cubePower._testResetBeacon()
        cubePower._markActive(100000)
        assert(cubePower._shouldEnterSleep(200000) === false, "100s elapsed < 3min")
    })

    test("sleep precondition: broadcasting beacon blocks sleep even if idle", function () {
        cubePower._testResetIdle()
        cubePower._testResetBeacon()
        cubePower._markActive(0)
        cubePower._startBeacon(190000, 1200)
        assert(cubePower._shouldEnterSleep(190500) === false, "beacon active blocks sleep")
        assert(cubePower._shouldEnterSleep(192000) === true, "beacon done, idle past timeout")
    })

    test("stepMotion: still + quiet diff stays still, no event", function () {
        cubePower._testResetMotionState()
        assertEq(cubePower._stepMotion(30, 1000), cubePower.MOTION_EVT_NONE, "no event")
    })

    test("stepMotion: still + large diff -> PICKUP", function () {
        cubePower._testResetMotionState()
        assertEq(cubePower._stepMotion(250, 1000), cubePower.MOTION_EVT_PICKUP, "pickup fired")
    })

    test("stepMotion: still + medium diff does not fire PICKUP", function () {
        cubePower._testResetMotionState()
        assertEq(cubePower._stepMotion(100, 1000), cubePower.MOTION_EVT_NONE, "under pickup threshold")
        assertEq(cubePower._stepMotion(250, 1100), cubePower.MOTION_EVT_PICKUP, "still in still state, so next large diff fires")
    })

    test("stepMotion: continued large diff does not re-fire PICKUP", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        assertEq(cubePower._stepMotion(250, 1050), cubePower.MOTION_EVT_NONE, "no re-fire")
        assertEq(cubePower._stepMotion(250, 1100), cubePower.MOTION_EVT_NONE, "still no re-fire")
    })

    test("stepMotion: moving + first quiet sample does not fire yet", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        assertEq(cubePower._stepMotion(30, 1100), cubePower.MOTION_EVT_NONE, "still timer started")
    })

    test("stepMotion: PUTDOWN fires after quiet continues past 4000ms", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        cubePower._stepMotion(30, 2000)
        assertEq(cubePower._stepMotion(30, 5000), cubePower.MOTION_EVT_NONE, "3000ms still, not yet")
        assertEq(cubePower._stepMotion(30, 6000), cubePower.MOTION_EVT_PUTDOWN, "4000ms still, fires")
    })

    test("stepMotion: medium diff resets the still timer (natural hand hold)", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        cubePower._stepMotion(30, 2000)
        assertEq(cubePower._stepMotion(100, 3000), cubePower.MOTION_EVT_NONE, "medium diff, timer reset")
        assertEq(cubePower._stepMotion(30, 4000), cubePower.MOTION_EVT_NONE, "still restart")
        assertEq(cubePower._stepMotion(30, 7900), cubePower.MOTION_EVT_NONE, "3900ms from restart")
        assertEq(cubePower._stepMotion(30, 8000), cubePower.MOTION_EVT_PUTDOWN, "4000ms from restart")
    })

    test("stepMotion: large diff during still window aborts putdown", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        cubePower._stepMotion(30, 2000)
        assertEq(cubePower._stepMotion(250, 2500), cubePower.MOTION_EVT_NONE, "motion resumes, no event")
        assertEq(cubePower._stepMotion(30, 3000), cubePower.MOTION_EVT_NONE, "still restart")
        assertEq(cubePower._stepMotion(30, 7000), cubePower.MOTION_EVT_PUTDOWN, "4000ms from new still start")
    })

    test("stepMotion: PUTDOWN restores still state, next large diff fires PICKUP", function () {
        cubePower._testResetMotionState()
        cubePower._stepMotion(250, 1000)
        cubePower._stepMotion(30, 2000)
        cubePower._stepMotion(30, 6000)
        assertEq(cubePower._stepMotion(250, 6500), cubePower.MOTION_EVT_PICKUP, "pickup after putdown")
    })

    test("feedMotionSample: decision uses window max every 5th sample", function () {
        cubePower._testResetMotionState()
        assertEq(cubePower._feedMotionSample(0, 1000), cubePower.MOTION_EVT_NONE, "sample 1")
        assertEq(cubePower._feedMotionSample(250, 1020), cubePower.MOTION_EVT_NONE, "spike mid-window, no decision yet")
        assertEq(cubePower._feedMotionSample(0, 1040), cubePower.MOTION_EVT_NONE, "sample 3")
        assertEq(cubePower._feedMotionSample(0, 1060), cubePower.MOTION_EVT_NONE, "sample 4")
        assertEq(cubePower._feedMotionSample(0, 1080), cubePower.MOTION_EVT_PICKUP, "window max 250 fires at 5th sample")
    })

    test("feedMotionSample: window max does not leak into later windows", function () {
        cubePower._testResetMotionState()
        cubePower._feedMotionSample(250, 1000)
        cubePower._feedMotionSample(0, 1020)
        cubePower._feedMotionSample(0, 1040)
        cubePower._feedMotionSample(0, 1060)
        assertEq(cubePower._feedMotionSample(0, 1080), cubePower.MOTION_EVT_PICKUP, "spike window fires")
        for (let t = 0; t < 4; t++) {
            assertEq(cubePower._feedMotionSample(30, 2000 + t * 20), cubePower.MOTION_EVT_NONE, "quiet window 1 sample " + t)
        }
        assertEq(cubePower._feedMotionSample(30, 2080), cubePower.MOTION_EVT_NONE, "still timer starts")
        for (let t = 0; t < 4; t++) {
            assertEq(cubePower._feedMotionSample(30, 7000 + t * 20), cubePower.MOTION_EVT_NONE, "quiet window 2 sample " + t)
        }
        assertEq(cubePower._feedMotionSample(30, 7080), cubePower.MOTION_EVT_PUTDOWN, "putdown fires; a leaked spike would have reset the timer")
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

// 実機計測モード: P0 生値のシリアル出力。起動時から on で、B ボタンで on/off を切り替える
// (拡張の役割初期化はしない)。Mac 側の集計は tools/measure が行う。手順は .claude/skills/measure-p0 を参照
let _rawLogging = true
if (_failed === 0) {
    basic.showIcon(IconNames.Chessboard)
}

input.onButtonPressed(Button.B, function () {
    _rawLogging = !_rawLogging
    if (_rawLogging) {
        basic.showIcon(IconNames.Chessboard)
    } else {
        basic.showIcon(IconNames.Yes)
    }
})

// 4桁ゼロ埋めの固定長で送る。シリアルの文字欠けが起きても桁数不一致で受信側が棄却できる。
// writeLine は1行を32バイトに空白パディングして転送量が4倍になるため writeString を使う
//
// p0 行 (20ms周期) に加え、モーション実測用の mo 行を100ms周期で混在させる。
// 差分は20msごとに取り、100ms窓内の最大値を送る (10Hzサンプリングだと手の振戦が
// エイリアスして消えるため。2026-07-11実測)。形式は mo:<3軸差分和4桁>:<classifyAccel結果1桁>
function _pad4(n: number): string {
    let s = "" + Math.min(n, 9999)
    while (s.length < 4) {
        s = "0" + s
    }
    return s
}

// 差分計算は cubePower._accelDiff を共用する。この計測ビルドは役割を初期化しない
// (cubePower._init が呼ばれない) ので、_accelDiff の内部状態を奪い合う相手はいない
let _moTick = 0
let _moWindowMax = 0
basic.forever(function () {
    if (_rawLogging) {
        serial.writeString("p0:" + _pad4(pins.analogReadPin(AnalogPin.P0)) + "\n")

        const mx = input.acceleration(Dimension.X)
        const my = input.acceleration(Dimension.Y)
        const mz = input.acceleration(Dimension.Z)
        const diff = cubePower._accelDiff(mx, my, mz)
        if (diff > _moWindowMax) _moWindowMax = diff

        _moTick++
        if (_moTick >= 5) {
            _moTick = 0
            serial.writeString("mo:" + _pad4(_moWindowMax) + ":" + cubeTouch._classifyAccel(mx, my, mz) + "\n")
            _moWindowMax = 0
        }
    }
    basic.pause(20)
})
