// TOPPING E2x2 OTG plugin look, ported from streamdeck-topping-e2x2 (src/render/meter.ts, keys.ts, theme.ts, protocol/meter.ts).
import { KEY, fitSize, fitText, frame, plainText } from '../svg.js'
import { base, clamp01, safeDb, type FaderRole, type MeterDesign, type MeterInput, type MeterKeyInput } from './types.js'

const BG = '#1F1F1F'
const PLATE = '#383838'
const PLATE_TEXT = '#D8D8D8'
const RED = '#E5483E'
const YELLOW = '#E2B23A'
const GREEN = '#73CB67'
const DIM = '#9A9A9A'
const WHITE = '#fff'
const TRACK = '#0F0F0F'
const TICK = '#666'
const MUTED_BAR = '#555'

// The TOPPING app's meter scale: piecewise linear through 0 dB 1, -6 0.84, -12 0.68, -24 0.44, -60 0; 0 dB sits at 0.8 of the axis, +12 dB at the end.
const POINTS = [[0, 1], [-6, 0.84], [-12, 0.68], [-24, 0.44], [-60, 0]] as const
const dbToLevel = (db: number): number => {
	if (!(db > -60)) return 0
	if (db >= 0) return 1
	for (let i = 1; i < POINTS.length; i++) {
		const [a, la] = POINTS[i - 1]
		const [b, lb] = POINTS[i]
		if (db >= b) return lb + ((db - b) / (a - b)) * (la - lb)
	}
	return 0
}
const AXIS_0DB = 0.8
const MAX_AXIS_DB = 12
export const dbToAxis = (db: number): number => (db <= 0 || Number.isNaN(db) ? dbToLevel(db) * AXIS_0DB : AXIS_0DB + (Math.min(db, MAX_AXIS_DB) / MAX_AXIS_DB) * (1 - AXIS_0DB))
const faderAxis = (f: MeterInput['fader']): number | undefined => (f === undefined ? undefined : 'db' in f ? dbToAxis(f.db) : clamp01(f.linear))

const background = (w: number, h: number) => `<rect width="${w}" height="${h}" fill="${BG}"/>`

function bar(x: number, y: number, w: number, h: number, level: number, vertical: boolean, muted: boolean, part: [number, number] = [0, 1]): string {
	const [mn, mx] = part
	const f = clamp01((level - mn) / (mx - mn))
	const stop = (v: number) => +clamp01((v - mn) / (mx - mn)).toFixed(4)
	const id = 'tg' + [x, y, w, h, mn].map((v) => +v.toFixed(2)).join('_').replace(/[.-]/g, 'p')
	const dir = vertical ? `x1="0" y1="${y + h}" x2="0" y2="${y}"` : `x1="${x}" y1="0" x2="${x + w}" y2="0"`
	let d =
		`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${dir}>` +
		`<stop offset="${stop(0)}" stop-color="${GREEN}"/><stop offset="${stop(dbToAxis(-12))}" stop-color="${GREEN}"/>` +
		`<stop offset="${stop(dbToAxis(-3))}" stop-color="${YELLOW}"/><stop offset="${stop(dbToAxis(0))}" stop-color="${RED}"/></linearGradient></defs>` +
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TRACK}"/>`
	if (f > 0) {
		const r = vertical ? `x="${x}" y="${+(y + h * (1 - f)).toFixed(2)}" width="${w}" height="${+(h * f).toFixed(2)}"` : `x="${x}" y="${y}" width="${+(w * f).toFixed(2)}" height="${h}"`
		d += `<rect ${r} fill="${muted ? MUTED_BAR : `url(#${id})`}"/>`
	}
	return d
}

function cap(cx: number, cy: number, w: number, h: number, vertical: boolean): string {
	cx = +cx.toFixed(2)
	cy = +cy.toFixed(2)
	const groove = vertical
		? `<line x1="${cx - w / 2 + 4}" y1="${cy}" x2="${cx + w / 2 - 4}" y2="${cy}" stroke="#555" stroke-width="2"/>`
		: `<line x1="${cx}" y1="${cy - h / 2 + 4}" x2="${cx}" y2="${cy + h / 2 - 4}" stroke="#555" stroke-width="2"/>`
	return `<rect x="${+(cx - w / 2).toFixed(2)}" y="${+(cy - h / 2).toFixed(2)}" width="${w}" height="${h}" rx="2" fill="${PLATE_TEXT}" stroke="#000" stroke-width="1.5"/>${groove}`
}

const plate = (cy: number, h: number, inner: string): string => `<rect x="4" y="${cy - h / 2}" width="${KEY - 8}" height="${h}" rx="5" fill="${PLATE}"/>${inner}`
const plateName = (name: string, cy: number, size: number): string => {
	const s = fitSize(name, size, 128, 10)
	return plainText(72, base(cy, s), fitText(name, s, 132), { size: s, fill: PLATE_TEXT })
}

function stripHeader(name: string, badge: MeterInput['badge']): string {
	let b = `<rect x="4" y="1" width="192" height="26" rx="5" fill="${PLATE}"/>`
	const right = badge ? 188 - fitText(badge.text, 15, 60).length * 9 - 6 : 188
	const s = fitSize(name, 22, right - 12, 10)
	b += plainText((12 + right) / 2, base(14, s), fitText(name, s, right - 8), { size: s, fill: PLATE_TEXT })
	if (badge) b += plainText(188, base(14, 15), fitText(badge.text, 15, 60), { size: 15, fill: badge.fill, anchor: 'end' })
	return b
}

const TICKS = [6, 0, -6, -12, -24]

function strip(v: MeterInput): string {
	const [l, r, fader] = [dbToAxis(safeDb(v.leftDb)), dbToAxis(safeDb(v.rightDb)), faderAxis(v.fader)]
	let b = background(200, 100) + stripHeader(v.name, v.badge)
	b += bar(12, 32, 176, 12, l, false, v.muted) + bar(12, 48, 176, 12, r, false, v.muted)
	for (const db of TICKS) {
		const x = +(12 + 176 * dbToAxis(db)).toFixed(2)
		b += `<line x1="${x}" y1="61" x2="${x}" y2="65" stroke="${TICK}" stroke-width="1.5"/>`
	}
	if (fader !== undefined) b += cap(12 + 176 * fader, 46, 12, 34, false)
	if (v.muted) b += v.peek ? plainText(100, base(83, 19), fitText(v.faderText, 19, 192), { size: 19, fill: WHITE }) : plainText(100, base(83, 19), 'MUTED', { size: 19, fill: RED })
	else b += plainText(6, base(83, 19), fitText(v.levelText, 19, 80), { size: 19, fill: DIM, anchor: 'start' }) + plainText(194, base(83, 19), fitText(v.faderText, 19, 125), { size: 19, fill: WHITE, anchor: 'end' })
	return frame(200, 100, b, v.overlay)
}

// Vertical pair: the axis starts under the fader value in the top key and runs to just above the level text in the bottom key.
const TEXT_END = 80
const CAP = 14 * (KEY / 100)
const AXIS_START = TEXT_END + CAP / 2
const TOP_LEN = KEY - AXIS_START
const BOTTOM_LEN = 104
const AXIS_LEN = TOP_LEN + BOTTOM_LEN
const SEAM = BOTTOM_LEN / AXIS_LEN
const V_BARS = [40.32, 77.76] as const
const V_BAR_W = 25.92
const H_START = 10
const H_LEN = KEY - H_START
const H_BAR = [98, 112] as const
const H_BAR_H = 12

function pair(v: MeterInput, role: FaderRole): string {
	const [left, right, fader] = [dbToAxis(safeDb(v.leftDb)), dbToAxis(safeDb(v.rightDb)), faderAxis(v.fader)]
	const vertical = role === 'top' || role === 'bottom'
	const high = role === 'top' || role === 'right'
	const split = vertical ? SEAM : 0.5
	const part: [number, number] = high ? [split, 1] : [0, split]
	let b = ''
	if (vertical) {
		const off = high ? 0 : KEY
		const local = (f: number) => AXIS_START + AXIS_LEN * (1 - f) - off
		const y = +(high ? AXIS_START : 0).toFixed(2)
		const h = +(high ? TOP_LEN : BOTTOM_LEN).toFixed(2)
		b += bar(V_BARS[0], y, V_BAR_W, h, left, true, v.muted, part) + bar(V_BARS[1], y, V_BAR_W, h, right, true, v.muted, part)
		for (const db of TICKS) {
			const f = dbToAxis(db)
			if (f >= part[0] && f <= part[1]) b += `<line x1="106.56" y1="${+local(f).toFixed(2)}" x2="115.2" y2="${+local(f).toFixed(2)}" stroke="${TICK}" stroke-width="2"/>`
		}
		if (fader !== undefined && Math.abs(local(fader) - KEY / 2) < KEY / 2 + CAP / 2) b += cap(72, local(fader), 86.4, CAP, true)
	} else {
		const off = high ? KEY : 0
		const local = (f: number) => H_START + 2 * H_LEN * f - off
		const x = high ? 0 : H_START
		b += bar(x, H_BAR[0], H_LEN, H_BAR_H, left, false, v.muted, part) + bar(x, H_BAR[1], H_LEN, H_BAR_H, right, false, v.muted, part)
		for (const db of TICKS) {
			const f = dbToAxis(db)
			if (f >= part[0] && f <= part[1]) b += `<line x1="${+local(f).toFixed(2)}" y1="126" x2="${+local(f).toFixed(2)}" y2="131" stroke="${TICK}" stroke-width="2"/>`
		}
		if (fader !== undefined && Math.abs(local(fader) - KEY / 2) < KEY / 2 + CAP / 2) b += cap(local(fader), 111, CAP, 30, false)
	}
	const row = (t: string, cy: number, size: number, fill: string) => {
		const s = fitSize(t, size, 132, 10)
		return plainText(72, base(cy, s), fitText(t, s, 136), { size: s, fill })
	}
	const level = (cy: number, size: number, fill: string) => (v.muted || v.levelText === '' ? '' : row(v.levelText, cy, size, fill))
	const muted = (cy: number, size: number) => plainText(72, base(cy, size), 'MUTED', { size, fill: RED })
	if (role === 'top') b = (v.name ? plate(21, 34, plateName(v.name, 21, 24)) : '') + (v.muted ? '' : row(v.faderText, 58, 26, WHITE)) + b
	// Left key: the level sits in the middle of the free space between the name plate (bottom 38) and the fader cap (top 96).
	else if (role === 'left') b = (v.name ? plate(21, 34, plateName(v.name, 21, 24)) : '') + level(67, 22, DIM) + b
	else if (role === 'bottom') b += v.muted ? (v.peek ? row(v.faderText, 129, 22, WHITE) : muted(129, 22)) : level(129, 22, DIM)
	else b += v.muted && !v.peek ? muted(50, 32) : row(v.faderText, 50, 32, WHITE)
	return frame(KEY, KEY, background(KEY, KEY) + b, v.overlay)
}

/** Value key: name plate, big value (MUTED while muted), L/R bars with the fader cap. */
function key(v: MeterKeyInput): string {
	const m = v.meter
	let b = background(KEY, KEY) + (v.title ? plate(21, 34, plateName(v.title, 21, 24)) : '')
	const [text, fill] = m.muted ? ['MUTED', RED] : [v.value, WHITE]
	const size = fitSize(text, 40, 132, 12)
	b += plainText(72, base(70, size), fitText(text, size, 136), { size, fill })
	b += bar(10, 98, 124, 12, dbToAxis(safeDb(m.leftDb)), false, m.muted) + bar(10, 114, 124, 12, dbToAxis(safeDb(m.rightDb)), false, m.muted)
	for (const db of TICKS) {
		const x = +(10 + 124 * dbToAxis(db)).toFixed(2)
		b += `<line x1="${x}" y1="128" x2="${x}" y2="133" stroke="${TICK}" stroke-width="1.5"/>`
	}
	const fader = faderAxis(m.fader)
	if (fader !== undefined) b += cap(10 + 124 * fader, 112, 12, 34, false)
	return frame(KEY, KEY, b, v.overlay)
}

export const topping: MeterDesign = { strip, pair, key }
