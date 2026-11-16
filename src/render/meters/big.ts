// "Big number": thin large fader value and two slim L/R bars, after the TOPPING app's volume screen (mockup approved 2026-11-16).
import { KEY, escapeXml, fitSize, fitText, frame, plainText, textWidth } from '../svg.js'
import { nameBlock } from './text.js'
import { MUTED_RED, base, clamp01, n, safeDb, type FaderRole, type MeterDesign, type MeterInput, type MeterKeyInput } from './types.js'

const WHITE = '#fff'
const GREY = '#bbb'
const TRACK = '#1d2a30'
const MUTED_BAR = '#555'
// Bars are linear in dB from -60 to 0 dBFS.
const barFrac = (db: number) => clamp01((safeDb(db) + 60) / 60)

function thinBars(x: number, y: number, w: number, h: number, gap: number, l: number, r: number, muted: boolean, id: string, vertical = false): string {
	const grad = vertical
		? `<linearGradient id="${id}" x1="0" x2="0" y1="${y + h}" y2="${y}" gradientUnits="userSpaceOnUse">`
		: `<linearGradient id="${id}" x1="${x}" x2="${x + w}" y1="0" y2="0" gradientUnits="userSpaceOnUse">`
	const stops = '<stop offset="0" stop-color="rgb(40,150,190)"/><stop offset="0.7" stop-color="rgb(90,200,200)"/><stop offset="1" stop-color="rgb(240,220,80)"/></linearGradient>'
	const fill = muted ? MUTED_BAR : `url(#${id})`
	const one = (i: number, db: number) => {
		const f = barFrac(db)
		if (vertical) {
			const xx = x + i * (w + gap)
			return `<rect x="${n(xx)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${TRACK}"/>` + (f > 0 ? `<rect x="${n(xx)}" y="${n(y + h * (1 - f))}" width="${n(w)}" height="${n(h * f)}" fill="${fill}"/>` : '')
		}
		const yy = y + i * (h + gap)
		return `<rect x="${n(x)}" y="${n(yy)}" width="${n(w)}" height="${n(h)}" fill="${TRACK}"/>` + (f > 0 ? `<rect x="${n(x)}" y="${n(yy)}" width="${n(w * f)}" height="${n(h)}" fill="${fill}"/>` : '')
	}
	return `<defs>${grad}${stops}</defs>` + one(0, l) + one(1, r)
}

/** Large light number with a small unit ("dB") after it, shrunk to fit maxWidth; a text with no number (MUTED) is drawn plain. */
function bigNumber(cx: number, baseline: number, text: string, size: number, maxWidth: number, fill = WHITE): string {
	const m = /^(.*?)\s*(dB)$/.exec(text)
	const [num, unit] = m ? [m[1], m[2]] : [text, '']
	const unitSize = Math.round(size * 0.4)
	const unitW = unit ? textWidth(unit, unitSize) + 4 : 0
	const s = fitSize(num, size, maxWidth - unitW, 12)
	const shown = fitText(num, s, maxWidth - unitW)
	const tspan = unit ? `<tspan font-size="${unitSize}" dx="4">${unit}</tspan>` : ''
	return `<text x="${n(cx)}" y="${n(baseline)}" font-family="Segoe UI" font-weight="300" font-size="${s}" fill="${fill}" text-anchor="middle">${escapeXml(shown)}${tspan}</text>`
}

const mutedText = (cx: number, cy: number, size: number) => plainText(cx, base(cy, size), 'MUTED', { size, fill: MUTED_RED })
const name = (text: string, x: number, cy: number, size: number, maxWidth: number, anchor: 'start' | 'middle' = 'middle', fill = WHITE) => {
	if (!text) return ''
	const s = fitSize(text, size, maxWidth, 10)
	return plainText(x, base(cy, s), fitText(text, s, maxWidth + 4), { size: s, fill, anchor })
}

function strip(v: MeterInput): string {
	// Top row: name left, level (or the badge, which takes priority) right.
	const right = v.badge ? { text: fitText(v.badge.text, 15, 60), fill: v.badge.fill, size: 15 } : { text: fitText(v.levelText, 14, 76), fill: GREY, size: 14 }
	const rightW = textWidth(right.text, right.size)
	let b = name(v.name, 8, 14, 18, 184 - rightW - 8, 'start', GREY)
	if (!v.muted || v.badge) b += plainText(192, base(14, right.size), right.text, { size: right.size, fill: right.fill, anchor: 'end' })
	b += v.muted && !v.peek ? mutedText(100, 52, 30) : bigNumber(100, 68, v.faderText, 44, 184)
	b += thinBars(10, 82, 180, 4, 3, v.leftDb, v.rightDb, v.muted, 'bs')
	return frame(200, 100, b, v.overlay)
}

/** Vertical: top key name + big fader value, bottom key L/R bars + level. Horizontal: left key = top content, right key = bottom content. */
function pair(v: MeterInput, role: FaderRole): string {
	const first = role === 'top' || role === 'left'
	let b: string
	// Long names wrap onto two rows above the number instead of shrinking to a thin line.
	if (first) b = nameBlock(v.name, { x: 72, top: 6, width: 128, height: 58, maxLines: 2, size: 24, minSize: 13 }) + (v.muted ? '' : bigNumber(72, 110, v.faderText, 40, 132))
	else {
		b = thinBars(12, 30, 120, 8, 6, v.leftDb, v.rightDb, v.muted, 'bp')
		b += v.muted ? (v.peek ? name(v.faderText, 72, 96, 26, 128) : mutedText(72, 96, 26)) : name(v.levelText, 72, 96, 26, 128)
	}
	return frame(KEY, KEY, b, v.overlay)
}

function key(v: MeterKeyInput): string {
	let b = nameBlock(v.title, { x: 72, top: 4, width: 128, height: 50, maxLines: 2, size: 22, minSize: 12 })
	b += v.meter.muted ? mutedText(72, 76, 30) : bigNumber(72, 92, v.value, 42, 132)
	b += thinBars(12, 112, 120, 5, 4, v.meter.leftDb, v.meter.rightDb, v.meter.muted, 'bk')
	return frame(KEY, KEY, b, v.overlay)
}

export const big: MeterDesign = { strip, pair, key }
