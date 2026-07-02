#!/usr/bin/env node
// pxt decompile が生成した main.blocks はトップレベルブロックの座標 (x/y) を持たず、
// web エディタで開くと自動レイアウトに変わってしまう。
// このスクリプトは旧 main.blocks から座標を控え、新 main.blocks の同種ブロックに書き戻す。
//
// 使い方:
//   node restore-blocks-layout.js <旧main.blocks> <新main.blocks(上書き)>
//
// マッチング: type 属性 + ブロック直下の field 値 (ボタンA/Bの別、関数定義の名前など) を
// キーに、同キーは出現順で対応づける。旧側に対応がない新ブロックは、既存ブロックの
// 下端より下へ縦に並べる。

'use strict'
const fs = require('fs')

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
}

function getAttr(tag, name) {
    const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
    return m ? m[1] : null
}

// <xml> 直下の要素を { name, startTag, start, end, inner } の配列で返す
function topLevelElements(xml) {
    const tagRe = /<(\/?)([a-zA-Z_][\w-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g
    const result = []
    let inXml = false
    let current = null
    let m
    while ((m = tagRe.exec(xml)) !== null) {
        const [whole, closing, name, , selfClosing] = m
        if (name === 'xml') {
            inXml = !closing
            continue
        }
        if (!inXml) continue
        if (!closing && !selfClosing) {
            if (!current) {
                current = { name, startTag: whole, start: m.index, tagEnd: m.index + whole.length, elDepth: 0 }
            }
            current.elDepth++
        } else if (closing) {
            if (current && --current.elDepth === 0) {
                current.end = m.index + whole.length
                current.inner = xml.slice(current.tagEnd, m.index)
                result.push(current)
                current = null
            }
        } else if (!current) {
            result.push({ name, startTag: whole, start: m.index, end: m.index + whole.length, inner: '' })
        }
    }
    return result
}

// ブロックの見た目上の高さの目安。中に入っているブロック数から概算する
function estHeight(el) {
    return 100 + 50 * (el.inner.match(/<block\b/g) || []).length
}

// type + ブロック直下の field 値。直下 = 最初の子要素 (<block>/<statement>/<value>) より
// 手前にある field。ハンドラ本体の中身をキーに含めないための区切り
function blockKey(el) {
    const type = getAttr(el.startTag, 'type') || el.name
    const cut = el.inner.search(/<(?:block|statement|value)\b/)
    const prefix = cut === -1 ? el.inner : el.inner.slice(0, cut)
    const fields = []
    const fieldRe = /<field name="[^"]*">([^<]*)<\/field>/g
    let m
    while ((m = fieldRe.exec(prefix)) !== null) fields.push(decodeEntities(m[1]))
    return fields.length > 0 ? type + ':' + fields.join(',') : type
}

function main() {
    const [oldPath, newPath] = process.argv.slice(2)
    if (!oldPath || !newPath) {
        console.error('usage: node restore-blocks-layout.js <old.blocks> <new.blocks>')
        process.exit(1)
    }
    const oldXml = fs.readFileSync(oldPath, 'utf8')
    let newXml = fs.readFileSync(newPath, 'utf8')

    const coords = new Map()
    let maxY = 0
    let bottomHeight = 100
    for (const el of topLevelElements(oldXml)) {
        if (el.name !== 'block') continue
        const x = getAttr(el.startTag, 'x')
        const y = getAttr(el.startTag, 'y')
        if (x === null || y === null) continue
        const key = blockKey(el)
        if (!coords.has(key)) coords.set(key, [])
        coords.get(key).push({ x, y })
        if (Number(y) >= maxY) {
            maxY = Number(y)
            bottomHeight = estHeight(el)
        }
    }
    if (coords.size === 0) {
        console.error(`warning: ${oldPath} に座標付きトップレベルブロックがない。何もしない`)
        process.exit(0)
    }

    let restored = 0
    const unmatched = []
    // 後ろから置換して start/end のずれを避ける
    const els = topLevelElements(newXml).filter(el => el.name === 'block').reverse()
    let newY = maxY + bottomHeight + 50
    for (const el of els) {
        const key = blockKey(el)
        const list = coords.get(key)
        let x, y
        if (list && list.length > 0) {
            ;({ x, y } = list.shift())
            restored++
        } else {
            x = '0'
            y = String(newY)
            newY += estHeight(el)
            unmatched.push(key)
        }
        let tag = el.startTag.replace(/\s+[xy]="[^"]*"/g, '')
        tag = tag.replace(/^<block\b/, `<block x="${x}" y="${y}"`)
        newXml = newXml.slice(0, el.start) + tag + newXml.slice(el.start + el.startTag.length)
    }

    fs.writeFileSync(newPath, newXml)
    console.log(`restored: ${restored} block(s)`)
    if (unmatched.length > 0) console.log(`new (auto-placed below): ${unmatched.reverse().join(', ')}`)
    const leftovers = []
    for (const [key, list] of coords) if (list.length > 0) leftovers.push(`${key} x${list.length}`)
    if (leftovers.length > 0) console.log(`removed since old layout: ${leftovers.join(', ')}`)
}

main()
