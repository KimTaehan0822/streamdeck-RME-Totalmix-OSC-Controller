// OBS / FreecShot Plus plugin look, ported from streamdeck-obs-audio (src/render/meter.ts, keys.ts). Floor fixed at -60 dB here.
import { KEY, NAME_WIDTH, fitSize, fitText, frame, plainText } from '../svg.js'
import { LINE_HEIGHT, nameBlock } from './text.js'
import { MUTED_RED, base, clamp01, n, safeDb, type FaderRole, type MeterDesign, type MeterInput, type MeterKeyInput } from './types.js'

type Style = 'standard' | 'wide'
// OBS VolumeMeter: sample peak warns at -20 / errors at -9 dB; true peak at -13 / -2 dB.
const zoneEdges = (style: Style): [number, number] => (style === 'wide' ? [-13, -2] : [-20, -9])
const FLOOR = -60
const BG = ['#267f26', '#7f7f26', '#7f2626']
const FG = ['#4cff4c', '#ffff4c', '#ff4c4c']
const BG_MUTED = ['#4a4a4a', '#5a5a5a', '#6a6a6a']
const FG_MUTED = '#bbb'
const WHITE = '#fff'
const FADER = 'rgb(40,140,255)'

interface Box {
	x: number
	y: number
	w: number
	h: number
}
interface Range {
	lo: number
	hi: number
}
/** What the OBS drawing needs: levels in dB, the fader on the OBS scale (dB, -60..0). */
interface View {
	style: Style
	left: number
	right: number
	faderDb?: number
	muted: boolean
}

const rect = (x: number, y: number, w: number, h: number, fill: string) => (w > 0 && h > 0 ? `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>` : '')
const along = (b: Box, vertical: boolean, f0: number, f1: number): Box =>
	vertical ? { x: b.x, y: b.y + b.h * (1 - f1), w: b.w, h: b.h * (f1 - f0) } : { x: b.x + b.w * f0, y: b.y, w: b.w * (f1 - f0), h: b.h }

function bar(b: Box, vertical: boolean, level: number, v: View, r: Range = { lo: FLOOR, hi: 0 }): string {
	const [warn, err] = zoneEdges(v.style)
	const f = (db: number) => clamp01((db - r.lo) / (r.hi - r.lo))
	const zones: [number, number][] = [
		[FLOOR, warn],
		[warn, err],
		[err, 0],
	]
	let out = ''
	zones.forEach(([a, z], i) => {
		const box = along(b, vertical, f(a), f(z))
		out += rect(box.x, box.y, box.w, box.h, v.muted ? BG_MUTED[i] : BG[i])
	})
	zones.forEach(([a, z], i) => {
		const top = Math.min(z, level)
		if (!(top > a)) return
		const box = along(b, vertical, f(a), f(top))
		out += rect(box.x, box.y, box.w, box.h, v.muted ? FG_MUTED : FG[i])
	})
	return out
}

function bars(b: Box, vertical: boolean, v: View, gap = 3): string {
	const half = vertical ? { ...b, w: (b.w - gap) / 2 } : { ...b, h: (b.h - gap) / 2 }
	const second = vertical ? { ...half, x: b.x + half.w + gap } : { ...half, y: b.y + half.h + gap }
	return bar(half, vertical, v.left, v) + bar(second, vertical, v.right, v)
}

function faderLine(b: Box, vertical: boolean, v: View, width: number): string {
	if (v.faderDb === undefined) return ''
	const db = Math.max(FLOOR, Math.min(0, v.faderDb))
	const p = along(b, vertical, (db - FLOOR) / -FLOOR, (db - FLOOR) / -FLOOR)
	const [x1, y1, x2, y2] = vertical ? [b.x, p.y, b.x + b.w, p.y] : [p.x, b.y, p.x, b.y + b.h]
	const line = (stroke: string, w: number) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${w}"/>`
	return line('#000', width + 4) + line(FADER, width)
}

const labelStep = (length: number, minGap = 24): 5 | 10 | 20 => {
	for (const step of [5, 10] as const) if ((length * step) / -FLOOR >= minGap) return step
	return 20
}

function scaleMarks(b: Box, vertical: boolean, size: number, seam?: number): string {
	const labelEvery = labelStep(vertical ? b.h : b.w, vertical ? 24 : (24 * size) / 11)
	let out = ''
	for (let db = 0; db >= FLOOR; db -= 5) {
		const p = along(b, vertical, (db - FLOOR) / -FLOOR, (db - FLOOR) / -FLOOR)
		const major = db % labelEvery === 0
		const label = major && (seam === undefined || Math.abs((vertical ? p.y : p.x) - seam) > 10)
		const len = major ? 4 : 2
		const [x1, y1, x2, y2] = vertical ? [b.x + b.w + 2, p.y, b.x + b.w + 2 + len, p.y] : [p.x, b.y + b.h + 2, p.x, b.y + b.h + 2 + len]
		out += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#aaa" stroke-width="1"/>`
		if (label)
			out += vertical
				? plainText(n(b.x + b.w + 8), n(p.y + size * 0.35), String(db), { size, fill: '#aaa', anchor: 'start' })
				: plainText(n(p.x), n(b.y + b.h + 6 + size * 0.9), String(db), { size, fill: '#aaa' })
	}
	return out
}

const obsMeter = (b: Box, vertical: boolean, v: View, width: number, size: number, seam?: number) => bars(b, vertical, v, 1) + faderLine(b, vertical, v, width) + scaleMarks(b, vertical, size, seam)

/** A gain (plain 0..1) spreads over the -60..0 scale; a mixer fader keeps its dB. */
const faderDb = (f: MeterInput['fader']): number | undefined => (f === undefined ? undefined : 'db' in f ? f.db : FLOOR + clamp01(f.linear) * -FLOOR)
const view = (style: Style, v: Pick<MeterInput, 'leftDb' | 'rightDb' | 'fader' | 'muted'>): View => ({
	style,
	left: safeDb(v.leftDb),
	right: safeDb(v.rightDb),
	faderDb: faderDb(v.fader),
	muted: v.muted,
})
const volumeLabel = (v: MeterInput) => (v.muted && !v.peek ? { text: 'MUTED', fill: MUTED_RED } : { text: v.faderText, fill: WHITE })

function design(style: Style): MeterDesign {
	function strip(v: MeterInput): string {
		const right = v.badge ? 196 - fitText(v.badge.text, 15, 60).length * 9 - 8 : 196
		let body = nameBlock(v.name, { x: (4 + right) / 2, top: 1, width: right - 8, height: 28, maxLines: 2, size: 20, minSize: 11 })
		if (v.badge) body += plainText(196, base(14, 15), fitText(v.badge.text, 15, 60), { size: 15, fill: v.badge.fill, anchor: 'end' })
		body += obsMeter({ x: 12, y: 31, w: 176, h: 19 }, false, view(style, v), 3, 11)
		if (!v.muted) {
			body += plainText(4, base(82, 19), fitText(v.levelText, 19, 80), { size: 19, fill: WHITE, anchor: 'start' })
			body += plainText(196, base(82, 19), fitText(v.faderText, 19, 125), { size: 19, fill: WHITE, anchor: 'end' })
		} else {
			const label = volumeLabel(v)
			body += plainText(100, base(82, 19), fitText(label.text, 19, 192), { size: 19, fill: label.fill })
		}
		return frame(200, 100, body, v.overlay)
	}

	function pair(v: MeterInput, role: FaderRole): string {
		const vertical = role === 'top' || role === 'bottom'
		const second = role === 'bottom' || role === 'right'
		const u = KEY / 100
		const size = n(20 * u)
		const nameSize = vertical ? 26 : 29
		const nameBox = { x: KEY / 2, top: 6, width: KEY - 16, height: nameSize * LINE_HEIGHT, maxLines: 1, size: nameSize, minSize: 16 }
		const nameBottom = nameBox.top + nameBox.height
		const volumeBaseline = n(nameBottom + 4 + 24 * 0.9)
		const mv = view(style, v)
		let body: string
		if (vertical) {
			const top = volumeBaseline + 10
			body = obsMeter({ x: 34, y: top, w: 44, h: 216 - top }, true, mv, 3, 14, KEY)
		} else {
			const top = nameBottom + 6
			body = obsMeter({ x: 16, y: n(top), w: 256, h: n(Math.max(16, 80 - top)) }, false, mv, 3, 14, KEY)
		}
		const row = (t: string, cy: number, fill = WHITE) => plainText(KEY / 2, base(cy * u, size), fitText(t, size, KEY - 4), { size, fill })
		const label = volumeLabel(v)
		let text = second ? '' : nameBlock(v.name, nameBox)
		if (vertical) text += second ? (v.muted ? row(label.text, 83, label.fill) : row(v.levelText, 83)) : v.muted ? '' : plainText(KEY / 2, volumeBaseline, fitText(v.faderText, 24, KEY - 16), { size: 24, fill: WHITE })
		else text += second ? (v.muted ? row(label.text, 83, label.fill) : row(v.faderText, 83)) : v.muted ? '' : row(v.levelText, 83)
		const shift = second ? (vertical ? `translate(0 -${KEY})` : `translate(-${KEY} 0)`) : ''
		return frame(KEY, KEY, (shift ? `<g transform="${shift}">${body}</g>` : body) + text, v.overlay)
	}

	/** Name at the top, value (or MUTED) in the middle, meter below: the OBS volume key. */
	function key(v: MeterKeyInput): string {
		const name = nameBlock(v.title, { x: KEY / 2, top: 6, width: NAME_WIDTH, height: 50, maxLines: 2, size: 36, minSize: 14 })
		const [text, fill] = v.meter.muted ? ['MUTED', MUTED_RED] : [v.value, WHITE]
		const status = plainText(KEY / 2, 92, fitText(text, fitSize(text, 40, KEY - 8, 14), KEY - 4), { size: fitSize(text, 40, KEY - 8, 14), fill })
		return frame(KEY, KEY, name + status + obsMeter({ x: 12, y: 104, w: 120, h: 13 }, false, view(style, v.meter), 2, 11), v.overlay)
	}
	return { strip, pair, key }
}

export const obs = design('standard')
export const obsWide = design('wide')
