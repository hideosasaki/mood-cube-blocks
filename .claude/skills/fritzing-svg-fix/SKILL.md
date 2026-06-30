---
name: fritzing-svg-fix
description: Fritzingからエクスポートしたdocs配下のSVG (fig_schematic.svg等) に対し、白背景の設定とコンテナ幅追従の調整を行う。Fritzingで再エクスポートするとこれらの調整が外れるので、SVGを更新したと言われたら呼び出す。
---

# fritzing-svg-fix

Fritzingからエクスポートしたdocs配下のSVGに対し、ドキュメント埋め込み時に問題となる2点を補正する。

## 適用する変更

1. `<svg>` ルートタグの `width` / `height` / `x` / `y` 属性を削除する。`viewBox` だけ残すことで、SVGはコンテナ幅に追従して伸縮するようになる
2. `<svg>` タグに `style="background:white"` を追加する。ダークモードで透明背景になり読めなくなるのを防ぐ

## 起動条件

ユーザーが次のいずれかを言ったらこのskillを実行する。

- 「svgを更新した」「Fritzingから再エクスポートした」
- 特定のSVGファイル名を出して「背景を白に」「幅を固定解除して」
- `docs/fig_*.svg` をユーザーが書き換えたと示唆する発言

## 手順

対象ファイルは `docs/fig_schematic.svg`。ブレッドボード図はPNG運用なのでSVG調整は不要。

```bash
cd /Users/sasaki/github/mood-cube-blocks/docs/ && python3 -c "
import re
f = 'fig_schematic.svg'
with open(f,'r') as fh: c = fh.read()
# Skip if already processed
if 'background:white' in c[:300]:
    print('already fixed')
else:
    c = re.sub(r'\s+(width|height|x|y)=[\"\\'][^\"\\']*[\"\\']', '', c, count=4)
    c = re.sub(r'(<svg)(\s)', r'\1 style=\"background:white\"\2', c, count=1)
    with open(f,'w') as fh: fh.write(c)
    print('fixed')
"
```

複数のSVGを一括で処理する必要がある場合はループする。

## 注意

- 既に処理済みのSVGに二重適用しないよう、先頭300バイトに `background:white` が含まれているかで判定する
- 内部の `<rect>` (パーツ図形) には触らない。`<svg>` ルートタグだけが対象。`count=4` / `count=1` を維持する
