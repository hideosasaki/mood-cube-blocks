// 触感キューブとして動かす場合の最小サンプル。
// 上面が確定するたびに 5x5 LED に面番号を表示し、
// ピンが刺さったら赤、抜けたら消灯する。
cubePair.setRole(CubeRole.Touch)

cubeTouch.onSurfaceChange(function (face: number) {
    basic.showNumber(face)
})

cubeTouch.onPinStuck(function (face: number) {
    cubeLight.setColor(NeoPixelColors.Red)
})

cubeTouch.onPinReleased(function (face: number) {
    cubeLight.setColor(NeoPixelColors.Black)
})
