import { dbToBar } from '../protocol/fader-curve.js'
import { KEY, NAME_WIDTH, fitSize, fitText, frame, plainText, type Overlay } from './svg.js'

// Ported from the Companion module's "Fader + VU meter" dial and two-key button fader presets (src/presets.ts).
// Companion lays elements out in 0–100 units of the canvas; Scale.sx/sy convert those units to SVG pixels.
export interface MeterView {
	name: string
	fader?: number
	left: number
	right: number
	faderDb: string
	levelDb: string
	muted: boolean
	/** muted and the fader was adjusted within the last 700 ms */
	peek: boolean
	/** Small tag at the top right of the strip, e.g. 48V on a Gain Dial. */
	badge?: { text: string; fill: string }
	overlay: Overlay
}

export type FaderRole = 'top' | 'bottom' | 'left' | 'right'

const WHITE = '#fff'
const RED = 'rgb(255,57,31)'
const BLUE = 'rgb(40,140,255)'
const STOPS: [number, number[]][] = [
	[0, [40, 200, 80]],
	[dbToBar(-18), [240, 210, 40]],
	[dbToBar(-3), [255, 57, 31]],
]

const colorAt = (v: number): number[] => {
	for (let i = 1; i < STOPS.length; i++) {
		const [v0, c0] = STOPS[i - 1]
		const [v1, c1] = STOPS[i]
		if (v <= v1) return c0.map((c, k) => c + ((c1[k] - c) * (v - v0)) / (v1 - v0))
	}
	return STOPS[STOPS.length - 1][1]
}
const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`
const n = (x: number) => +x.toFixed(2)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

interface Box {
	x: number
	y: number
	w: number
	h: number
}
interface Scale {
	sx: number
	sy: number
	vertical: boolean
	min: number
	max: number
}

const rect = (b: Box, s: Scale, fill: string, opacity = 1) =>
	`<rect x="${n(b.x * s.sx)}" y="${n(b.y * s.sy)}" width="${n(b.w * s.sx)}" height="${n(b.h * s.sy)}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`

// Green → yellow → red gradient over the bar's full range (the half it covers on a two-key fader).
function gradient(along: Box, s: Scale): string {
	const { min, max } = s
	const stops = [min, ...STOPS.map(([v]) => v).filter((v) => v > min && v < max), max]
	const [x1, y1, x2, y2] = s.vertical
		? [0, (along.y + along.h) * s.sy, 0, along.y * s.sy]
		: [along.x * s.sx, 0, (along.x + along.w) * s.sx, 0]
	return (
		`<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
		stops.map((v) => `<stop offset="${n((v - min) / (max - min))}" stop-color="${rgb(colorAt(v))}"/>`).join('') +
		'</linearGradient>'
	)
}

// Dimmed full-range track plus the part of the gradient up to the (clamped) level.
function bar(b: Box, s: Scale, level: number): string {
	const f = clamp01((level - s.min) / (s.max - s.min))
	const fill: Box = s.vertical ? { ...b, y: b.y + b.h * (1 - f), h: b.h * f } : { ...b, w: b.w * f }
	return rect(b, s, 'url(#g)', 0.25) + (f > 0 ? rect(fill, s, 'url(#g)') : '')
}

// Fader line (black outline under blue); hidden when the fader is outside this meter's range.
function marker(b: Box, s: Scale, fader: number | undefined, px: number): string {
	if (fader === undefined || fader < s.min || fader > s.max) return ''
	const f = (fader - s.min) / (s.max - s.min)
	const [x1, y1, x2, y2] = s.vertical
		? [b.x, b.y + b.h * (1 - f), b.x + b.w, b.y + b.h * (1 - f)]
		: [b.x + b.w * f, b.y, b.x + b.w * f, b.y + b.h]
	const line = (color: string, width: number) =>
		`<line x1="${n(x1 * s.sx)}" y1="${n(y1 * s.sy)}" x2="${n(x2 * s.sx)}" y2="${n(y2 * s.sy)}" stroke="${color}" stroke-width="${width * px}"/>`
	return line('#000', 7) + line(BLUE, 3)
}

const hatch = (lines: [number, number, number, number][], s: Scale, px: number) =>
	lines
		.map(
			([a, b, c, d]) =>
				`<line x1="${n(a * s.sx)}" y1="${n(b * s.sy)}" x2="${n(c * s.sx)}" y2="${n(d * s.sy)}" stroke="${RED}" stroke-width="${2 * px}"/>`,
		)
		.join('')

// Vertical text centre -> SVG baseline
const base = (cy: number, size: number) => n(cy + size * 0.35)

export function renderVuStrip(v: MeterView): string {
	const s: Scale = { sx: 2, sy: 1, vertical: false, min: 0, max: 1 }
	const l: Box = { x: 6, y: 31, w: 88, h: 13 }
	const r: Box = { x: 6, y: 47, w: 88, h: 13 }
	const markerBox: Box = { x: 6, y: 28, w: 88, h: 35 }
	let body = `<defs>${gradient(l, s)}</defs>`
	body += `<g${v.muted ? ' opacity="0.4"' : ''}>${bar(l, s, v.left)}${bar(r, s, v.right)}</g>`
	if (v.muted) body += hatch([6, 16, 26, 36, 46, 56, 66, 76].map((x) => [x, 60, x + 14, 31]), s, 1)
	body += marker(markerBox, s, v.fader, 1)
	// A badge takes the right end of the name row; the name centres in what is left.
	const badge = v.badge && fitText(v.badge.text, 15, 96)
	const nameRight = badge ? 196 - badge.length * 9 - 8 : 196
	const nameSize = fitSize(v.name, 24, nameRight - 8, 12)
	body += plainText(n((4 + nameRight) / 2), base(14, nameSize), fitText(v.name, nameSize, nameRight - 4), { size: nameSize, fill: WHITE })
	if (v.badge && badge) body += plainText(196, base(14, 15), badge, { size: 15, fill: v.badge.fill, anchor: 'end' })
	if (!v.muted) {
		body += plainText(4, base(82, 19), fitText(v.levelDb, 19, 96), { size: 19, fill: WHITE, anchor: 'start' })
		// fitText overestimates digits; 150 lets 'Gain -11.0 dB' through while the real text still clears the left value.
		body += plainText(196, base(82, 19), fitText(v.faderDb, 19, 150), { size: 19, fill: WHITE, anchor: 'end' })
	} else if (v.peek) body += plainText(100, base(82, 19), fitText(v.faderDb, 19, 192), { size: 19, fill: WHITE })
	else body += plainText(100, base(82, 19), 'MUTED', { size: 19, fill: RED })
	return frame(200, 100, body, v.overlay)
}

export function renderButtonFader(v: MeterView, role: FaderRole): string {
	const vertical = role === 'top' || role === 'bottom'
	const high = role === 'top' || role === 'right'
	const u = KEY / 100
	const s: Scale = { sx: u, sy: u, vertical, min: high ? 0.5 : 0, max: high ? 1 : 0.5 }
	// Bars touch the seam with equal length in both keys so the meter continues across them.
	const along = vertical ? { y: high ? 50 : 0, h: 50 } : { x: high ? 0 : 6, w: 94 }
	const box = (across: { x: number; w: number } | { y: number; h: number }) => ({ ...across, ...along }) as Box
	const l = box(vertical ? { x: 28, w: 18 } : { y: 30, h: 16 })
	const r = box(vertical ? { x: 54, w: 18 } : { y: 50, h: 16 })
	const markerBox = box(vertical ? { x: 22, w: 56 } : { y: 26, h: 44 })

	let body = `<defs>${gradient(l, s)}</defs>`
	body += `<g${v.muted ? ' opacity="0.4"' : ''}>${bar(l, s, v.left)}${bar(r, s, v.right)}</g>`
	if (v.muted) {
		// "/" strokes clipped to the bar area
		const [x0, x1, y0, y1] = vertical ? [28, 72, high ? 50 : 0, high ? 100 : 50] : [high ? 0 : 6, high ? 94 : 100, 30, 66]
		const lines: [number, number, number, number][] = []
		for (let c = x0 + y0 + 8; c < x1 + y1; c += 12) {
			const [low, top] = [Math.max(y0, c - x1), Math.min(y1, c - x0)]
			if (top - low >= 4) lines.push([c - top, top, c - low, low])
		}
		body += hatch(lines, s, 2)
	}
	body += marker(markerBox, s, v.fader, 2)

	// Text rows per role (centre y in units): name, fader dB, level dB; name stays when muted, the dB values hide
	const size = 20 * u
	const text = (t: string, cy: number, fill = WHITE, maxWidth = KEY, s = size) => plainText(KEY / 2, base(cy * u, s), fitText(t, s, maxWidth), { size: s, fill })
	const rows: [string, number][] = vertical
		? high
			? [['name', 11], ['value', 33]]
			: [['level', 83]]
		: high
			? [['value', 83]]
			: [['name', 12], ['level', 83]]
	for (const [kind, cy] of rows) {
		// Long names shrink (down to 7 units, about 21 Latin or 15 Hangul characters) to fit the key rather than being cut.
		if (kind === 'name') body += text(v.name, cy, WHITE, KEY - 8, fitSize(v.name, size, NAME_WIDTH, 7 * u))
		else if (!v.muted) body += text(kind === 'value' ? v.faderDb : v.levelDb, cy)
	}
	// MUTED (or briefly the fader dB) sits in the bottom row of the bottom / right key
	if (v.muted && vertical !== high) body += v.peek ? text(v.faderDb, 83) : text('MUTED', 83, RED)
	return frame(KEY, KEY, body, v.overlay)
}
