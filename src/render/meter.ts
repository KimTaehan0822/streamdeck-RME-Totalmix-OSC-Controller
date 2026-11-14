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
	/** fader is a plain 0..1 position (the Gain Dial's gain), so TotalMix designs leave it off their dB scale. */
	linearFader?: boolean
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

/** plugin: the original look; classic and modern: TotalMix FX's old and new designs, measured from its screen. */
export type MeterStyle = 'plugin' | 'classic' | 'modern'
let style: MeterStyle = 'plugin'
export function setMeterStyle(value: unknown): void {
	style = value === 'classic' || value === 'modern' ? value : 'plugin'
}

// TotalMix bar height per dB (0 dB = 1), scaled so 0 dB sits at 90% and the fader line can still reach +6 dB.
const TM_SCALE: [number, number][] = (
	[[-65, 0], [-30, 0.39], [-20, 0.51], [-15, 0.59], [-12, 0.65], [-9, 0.71], [-6, 0.79], [-3, 0.9], [0, 1], [6, 1 / 0.9]] as [number, number][]
).map(([db, f]) => [db, f * 0.9])
const interpolate = (points: [number, number][], x: number): number => {
	if (!(x > points[0][0])) return points[0][1] // NaN reads as the bottom
	for (let i = 1; i < points.length; i++) {
		const [x0, y0] = points[i - 1]
		const [x1, y1] = points[i]
		if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
	}
	return points[points.length - 1][1]
}
const tmBar = (db: number) => interpolate(TM_SCALE, db)
/** Meter and fader values arrive on the plugin's linear -65..+6 dB bar; TotalMix designs redraw them on TotalMix's scale. */
const toScale = (v: number) => (style === 'plugin' ? v : tmBar(v * 71 - 65))

const CLASSIC_STOPS: [number, number[]][] = (
	[
		[-65, [133, 255, 3]], [-30, [163, 255, 3]], [-20, [185, 255, 1]], [-12, [222, 255, 1]], [-8, [249, 250, 0]], [-6, [253, 225, 0]],
		[-4, [253, 183, 0]], [-3, [253, 133, 1]], [-1, [253, 80, 1]], [0, [253, 57, 1]], [6, [253, 40, 1]],
	] as [number, number[]][]
).map(([db, c]) => [tmBar(db), c])
const stops = () => (style === 'classic' ? CLASSIC_STOPS : STOPS)

const colorAt = (v: number): number[] => {
	const STOPS = stops()
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
	const offsets = [min, ...stops().map(([v]) => v).filter((v) => v > min && v < max), max]
	const [x1, y1, x2, y2] = s.vertical
		? [0, (along.y + along.h) * s.sy, 0, along.y * s.sy]
		: [along.x * s.sx, 0, (along.x + along.w) * s.sx, 0]
	return (
		`<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
		offsets.map((v) => `<stop offset="${n((v - min) / (max - min))}" stop-color="${rgb(colorAt(v))}"/>`).join('') +
		'</linearGradient>'
	)
}

// Dimmed full-range track plus the part of the gradient up to the (clamped) level.
// TotalMix designs: dark track instead, then the classic gradient or the new design's flat zones with a brighter tip.
function bar(b: Box, s: Scale, level: number): string {
	const span = s.max - s.min
	/** The bar between two scale values, clipped to this meter's range. */
	const part = (from: number, to: number, fill: string) => {
		const [a, z] = [clamp01((from - s.min) / span), clamp01((to - s.min) / span)]
		if (!(z > a)) return '' // also skips NaN levels
		return rect(s.vertical ? { ...b, y: b.y + b.h * (1 - z), h: b.h * (z - a) } : { ...b, x: b.x + b.w * a, w: b.w * (z - a) }, s, fill)
	}
	if (style === 'plugin') return rect(b, s, 'url(#g)', 0.25) + part(s.min, level, 'url(#g)')
	level = toScale(level)
	if (style === 'classic') return rect(b, s, 'rgb(31,41,48)') + part(s.min, level, 'url(#g)')
	const [yellow, red] = [tmBar(-3), tmBar(-0.3)]
	let body = rect(b, s, 'rgb(50,58,64)')
	body += part(s.min, Math.min(level, yellow), 'rgb(25,209,32)') + part(yellow, Math.min(level, red), 'rgb(255,189,32)') + part(red, level, 'rgb(255,71,27)')
	const tip = (2 / (s.vertical ? b.h * s.sy : b.w * s.sx)) * span
	return body + part(level - tip, level, level < yellow ? 'rgb(12,255,16)' : level < red ? 'rgb(255,254,16)' : 'rgb(255,71,27)')
}

const TICKS = [0, -6, -10, -20, -40, -60]
/** TotalMix designs only: lines across the bars at TotalMix's scale marks, and its numbers where labels give room. */
function scale(b: Box, s: Scale, px: number, labels?: { x?: number; y?: number; size: number; skip?: number }): string {
	if (style === 'plugin') return ''
	let body = ''
	for (const db of TICKS) {
		const v = tmBar(db)
		if (v < s.min || v > s.max) continue
		const f = (v - s.min) / (s.max - s.min)
		const [x1, y1, x2, y2] = s.vertical
			? [b.x * s.sx, (b.y + b.h * (1 - f)) * s.sy, (b.x + b.w) * s.sx, (b.y + b.h * (1 - f)) * s.sy]
			: [(b.x + b.w * f) * s.sx, b.y * s.sy, (b.x + b.w * f) * s.sx, (b.y + b.h) * s.sy]
		body += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="rgba(210,220,230,0.6)" stroke-width="${px}"/>`
		if (!labels || db === labels.skip) continue
		const [x, y] = s.vertical ? [labels.x ?? 0, base(y1, labels.size)] : [n(x1), labels.y ?? 0]
		body += plainText(x, y, String(-db), { size: labels.size, fill: 'rgb(160,170,180)' })
	}
	return body
}

// Fader line (black outline under blue); hidden when the fader is outside this meter's range.
function marker(b: Box, s: Scale, fader: number | undefined, px: number, linear = false): string {
	if (fader !== undefined && !linear) fader = toScale(fader)
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
	body += scale({ x: 6, y: 31, w: 88, h: 29 }, s, 1, { y: 71, size: 11 })
	body += marker(markerBox, s, v.fader, 1, v.linearFader)
	// A badge takes the right end of the name row; the name centres in what is left.
	const badge = v.badge && fitText(v.badge.text, 15, 96)
	const nameRight = badge ? 196 - badge.length * 9 - 8 : 196
	const nameSize = fitSize(v.name, 24, nameRight - 8, 12)
	body += plainText(n((4 + nameRight) / 2), base(14, nameSize), fitText(v.name, nameSize, nameRight - 4), { size: nameSize, fill: WHITE })
	if (v.badge && badge) body += plainText(196, base(14, 15), badge, { size: 15, fill: v.badge.fill, anchor: 'end' })
	if (!v.muted) {
		body += plainText(4, base(82, 19), fitText(v.levelDb, 19, 96), { size: 19, fill: WHITE, anchor: 'start' })
		// 125 lets 'Gain +12.0 dB' through while the text still clears the level value on the left.
		body += plainText(196, base(82, 19), fitText(v.faderDb, 19, 125), { size: 19, fill: WHITE, anchor: 'end' })
	} else if (v.peek) body += plainText(100, base(82, 19), fitText(v.faderDb, 19, 192), { size: 19, fill: WHITE })
	else body += plainText(100, base(82, 19), 'MUTED', { size: 19, fill: RED })
	return frame(200, 100, body, v.overlay)
}

export type MeterBars = Pick<MeterView, 'fader' | 'left' | 'right' | 'muted'>

/** The VU strip's bars and fader line, fitted to the 124x14 value bar of a key. */
export function renderKeyMeter(v: MeterBars): string {
	const s: Scale = { sx: 1, sy: 1, vertical: false, min: 0, max: 1 }
	const l: Box = { x: 10, y: 108, w: 124, h: 6 }
	const r: Box = { x: 10, y: 116, w: 124, h: 6 }
	let body = `<defs>${gradient(l, s)}</defs>`
	body += `<g${v.muted ? ' opacity="0.4"' : ''}>${bar(l, s, v.left)}${bar(r, s, v.right)}</g>`
	if (v.muted) body += hatch([12, 28, 44, 60, 76, 92, 108, 124].map((x) => [x, 122, x + 10, 108]), s, 1)
	return body + scale({ x: 10, y: 108, w: 124, h: 14 }, s, 1) + marker({ x: 10, y: 105, w: 124, h: 20 }, s, v.fader, 1)
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
	// Numbers fit only left of the vertical bars; 6 would touch 10 there, so it keeps just its line.
	body += scale(box(vertical ? { x: 28, w: 44 } : { y: 30, h: 36 }), s, 2, vertical ? { x: 13 * u, size: 15, skip: -6 } : undefined)
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
