// "VU needle": amber analogue VU face, needle on the louder of L and R (mockup approved 2026-11-16).
import { KEY, fitSize, fitText, frame, plainText } from '../svg.js'
import { nameBlock, wrapName } from './text.js'
import { MUTED_RED, base, n, safeDb, type FaderRole, type MeterDesign, type MeterInput, type MeterKeyInput } from './types.js'

const WHITE = '#fff'
const INK = '#222'
const RED = '#c0291b'
/** 0 VU sits this many dB below 0 dBFS. */
const REF = 12
// Classic VU scale: share of the full swing at each VU mark.
const VU_POS: [number, number][] = [[-20, 0], [-10, 0.17], [-7, 0.29], [-5, 0.38], [-3, 0.5], [-2, 0.56], [-1, 0.63], [0, 0.71], [1, 0.79], [2, 0.88], [3, 1]]
export function vuFrac(vu: number): number {
	if (!(vu > -20)) return 0
	for (let i = 1; i < VU_POS.length; i++) {
		const [a, fa] = VU_POS[i - 1]
		const [b, fb] = VU_POS[i]
		if (vu <= b) return fa + ((fb - fa) * (vu - a)) / (b - a)
	}
	return 1.04 // pinned just past +3
}

/** The VU face in the box; `id` keeps the gradient and clip apart from other faces on the same image. */
function face(x: number, y: number, w: number, h: number, db: number, muted: boolean, id: string): string {
	const cx = x + w / 2
	const pivot = y + h * 1.02
	const r = Math.min(h * 0.72, w * 0.5)
	const ang = (f: number) => ((-48 + 96 * f) * Math.PI) / 180
	const pt = (f: number, rr: number): [number, number] => [cx + rr * Math.sin(ang(f)), pivot - rr * Math.cos(ang(f))]
	let s =
		`<defs><radialGradient id="${id}" cx="50%" cy="85%" r="80%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.6" stop-color="#f2b54a"/><stop offset="1" stop-color="#9a5a12"/></radialGradient>` +
		`<clipPath id="${id}c"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6"/></clipPath></defs>`
	s += `<g${muted ? ' opacity="0.4"' : ''}><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6" fill="url(#${id})"/><g clip-path="url(#${id}c)">`
	const arc = (f0: number, f1: number, color: string, width: number) => {
		const [x0, y0] = pt(f0, r)
		const [x1, y1] = pt(f1, r)
		return `<path d="M${n(x0)} ${n(y0)} A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y1)}" fill="none" stroke="${color}" stroke-width="${width}"/>`
	}
	s += arc(0, vuFrac(0), INK, 1.5) + arc(vuFrac(0), 1, RED, 3)
	const labelSize = n(h * 0.14)
	for (const [vu, label] of [[-20, '20'], [-10, '10'], [-7, '7'], [-5, '5'], [-3, '3'], [0, '0'], [3, '3']] as const) {
		const f = vuFrac(vu)
		const red = vu >= 0
		const [a1, b1] = pt(f, r)
		const [a2, b2] = pt(f, r + h * 0.09)
		s += `<line x1="${n(a1)}" y1="${n(b1)}" x2="${n(a2)}" y2="${n(b2)}" stroke="${red ? RED : INK}" stroke-width="1.2"/>`
		const [lx, ly] = pt(f, r + h * 0.16)
		s += plainText(n(lx), n(ly + h * 0.05), label, { size: labelSize, fill: red ? RED : INK })
	}
	// "VU" sits left of the needle's path so the needle never crosses it.
	s += plainText(n(x + w * 0.2), n(y + h * 0.88), 'VU', { size: n(h * 0.16), fill: INK })
	const level = safeDb(db)
	const [nx, ny] = pt(muted ? 0 : vuFrac(level + REF), r + h * 0.06)
	s += `<line x1="${n(cx)}" y1="${n(pivot)}" x2="${n(nx)}" y2="${n(ny)}" stroke="#111" stroke-width="1.6"/>`
	s += `</g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6" fill="none" stroke="#3a2608" stroke-width="2"/></g>`
	return s
}

const loud = (l: number, r: number) => Math.max(safeDb(l), safeDb(r))
const text = (t: string, x: number, cy: number, size: number, maxWidth: number, fill = WHITE) => {
	if (!t) return ''
	const s = fitSize(t, size, maxWidth, 9)
	return plainText(x, base(cy, s), fitText(t, s, maxWidth + 4), { size: s, fill })
}
/** The fader text split into number and unit for a compact two-row value. */
const split = (t: string): [string, string] => {
	const m = /^(.*?)\s*(dB)$/.exec(t)
	return m ? [m[1], m[2]] : [t, '']
}

function strip(v: MeterInput): string {
	let b = face(58, 6, 136, 88, loud(v.leftDb, v.rightDb), v.muted, 'vs')
	// Left column: name on up to two rows, then the fader value (MUTED while muted).
	// One row while the name still fits at 11 px or more; only longer names wrap onto two rows.
	const one = fitSize(v.name, 15, 50, 9)
	const rows = one >= 11 ? { lines: v.name ? [v.name] : [], size: one } : wrapName(v.name, 15, 50, 2, 9)
	rows.lines.forEach((row, i) => (b += plainText(29, base((rows.lines.length > 1 ? 16 : 24) + i * rows.size * 1.15, rows.size), row, { size: rows.size, fill: WHITE })))
	if (v.badge) b += text(v.badge.text, 29, 92, 12, 50, v.badge.fill)
	if (v.muted && !v.peek) b += text('MUTED', 29, 60, 13, 52, MUTED_RED)
	else {
		const [num, unit] = split(v.faderText)
		b += text(num, 29, 58, 19, 52) + text(unit, 29, 76, 12, 50, '#aaa')
	}
	return frame(200, 100, b, v.overlay)
}

/** Vertical: top key name + big fader value, bottom key VU face + level. Horizontal: left key = top content, right key = bottom content. */
function pair(v: MeterInput, role: FaderRole): string {
	const first = role === 'top' || role === 'left'
	let b: string
	if (first) b = nameBlock(v.name, { x: 72, top: 8, width: 128, height: 58, maxLines: 2, size: 24, minSize: 13 }) + (v.muted ? '' : text(v.faderText, 72, 104, 34, 132))
	else {
		b = face(6, 14, 132, 96, loud(v.leftDb, v.rightDb), v.muted, 'vp')
		b += v.muted ? (v.peek ? text(v.faderText, 72, 128, 18, 128) : text('MUTED', 72, 128, 18, 128, MUTED_RED)) : text(v.levelText, 72, 128, 18, 128)
	}
	return frame(KEY, KEY, b, v.overlay)
}

function key(v: MeterKeyInput): string {
	let b = text(v.title, 72, 18, 20, 128)
	b += face(8, 32, 128, 82, loud(v.meter.leftDb, v.meter.rightDb), v.meter.muted, 'vk')
	b += v.meter.muted ? text('MUTED', 72, 130, 18, 128, MUTED_RED) : text(v.value, 72, 130, 18, 128)
	return frame(KEY, KEY, b, v.overlay)
}

export const vu: MeterDesign = { strip, pair, key }
