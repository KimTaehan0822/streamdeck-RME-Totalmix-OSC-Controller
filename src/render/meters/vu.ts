// "VU needle": amber analogue VU face, needle on the louder of L and R (mockup approved 2026-11-16).
import { KEY, fitSize, fitText, frame, plainText } from '../svg.js'
import { nameBlock } from './text.js'
import { MUTED_RED, base, n, safeDb, type FaderRole, type MeterDesign, type MeterInput, type MeterKeyInput } from './types.js'

const WHITE = '#fff'
const INK = '#222'
const RED = '#c0291b'
// Calibration (plugin-wide settings): 0 VU sits at `reference` dBFS, as DAW VU meters do. TotalMix OSC sends only sample
// peaks, which read higher than the RMS a VU shows, so the user's `peakOffset` is taken off first. Measured differences
// (peak minus RMS) run from 0 dB (square wave) through 3 (sine) and 4.5-7 (compressed music) to 14.5 (speech); see the manual.
export const DEFAULT_REFERENCE = -18
export const DEFAULT_PEAK_OFFSET = 5
let reference = DEFAULT_REFERENCE
let peakOffset = DEFAULT_PEAK_OFFSET
const given = (v: unknown) => v !== undefined && v !== null && v !== ''
/** Settings arrive as strings; anything unusable falls back to the defaults, the offset is held to 0..15 dB. */
export function setVuCalibration(ref: unknown, offset: unknown): void {
	const r = Number(ref)
	reference = given(ref) && Number.isFinite(r) && r >= -40 && r < 0 ? r : DEFAULT_REFERENCE
	const o = Number(offset)
	peakOffset = given(offset) && Number.isFinite(o) ? Math.min(15, Math.max(0, o)) : DEFAULT_PEAK_OFFSET
}
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

// Needle ballistics like a real VU: the needle shows the signal's average over about 300 ms, not its peaks.
// The peak-corrected level is averaged as an amplitude with a 300 ms time constant,
// the same up and down; a short burst barely moves the needle and it sinks as slowly as it rises.
// Rendering is synchronous, so the caller names the key before drawing it (smoothNeedle) and clears it after.
const AVERAGE_MS = 300
const needles = new Map<string, { amp: number; at: number }>()
let current: string | undefined
let moving = false
let clock: () => number = Date.now
export const setNeedleClock = (c: () => number) => void (clock = c)
export const smoothNeedle = (key: string | undefined) => void (current = key)
/** True when a needle drawn since the last call has not reached its level yet; reading clears it. */
export function needleMoving(): boolean {
	const m = moving
	moving = false
	return m
}
export function forgetNeedle(key: string): void {
	for (const k of needles.keys()) if (k.startsWith(key + '/')) needles.delete(k)
}
const toAmp = (db: number) => (db === -Infinity ? 0 : 10 ** (db / 20))
const toDb = (amp: number) => (amp > 0 ? 20 * Math.log10(amp) : -Infinity)
/** The averaged level in dBFS for this needle (the level itself when no key is named, as in tests). */
function follow(id: string, db: number, frac: (db: number) => number): number {
	if (current === undefined) return db
	const k = `${current}/${id}`
	const now = clock()
	const last = needles.get(k)
	const target = toAmp(db)
	let amp = target
	// A long gap (no frames for a second) means the needle would have settled anyway.
	if (last && now - last.at < 1000) {
		amp = target + (last.amp - target) * Math.exp(-Math.max(0, now - last.at) / AVERAGE_MS)
		if (Math.abs(frac(toDb(amp)) - frac(db)) < 0.004) amp = target
		else moving = true
	}
	needles.set(k, { amp, at: now })
	return toDb(amp)
}

interface Gauge {
	/** Needle pivot (may sit below the face; the face clips it) and needle reach to the scale. */
	cx: number
	pivot: number
	r: number
	/** Half the swing in degrees: 48 on wide faces, narrower on tall ones so the arc still fits across. */
	half: number
	/** Where "VU" sits, left of the needle's path. */
	vu: [number, number]
}
/** The usual gauge for a face box: pivot just under the bottom, as on the Fader key. */
const fitGauge = (x: number, y: number, w: number, h: number): Gauge => {
	const r = Math.min(h * 0.72, w * 0.5)
	return { cx: x + w / 2, pivot: y + h * 1.02, r, half: 48, vu: [x + w * 0.2, y + h * 0.78] }
}

/**
 * The VU face in the box and the level its needle shows (dBFS after the peak offset and the average).
 * `id` keeps the gradient and clip apart from other faces on the same image.
 */
function face(x: number, y: number, w: number, h: number, peakDb: number, muted: boolean, id: string, g: Gauge = fitGauge(x, y, w, h)): [string, number] {
	const { cx, pivot, r, half } = g
	const ang = (f: number) => ((-half + 2 * half * f) * Math.PI) / 180
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
	// Ticks, numbers and the needle scale with the needle's reach, so every face size reads alike.
	const labelSize = n(Math.min(r * 0.194, 16))
	for (const [vu, label] of [[-20, '20'], [-10, '10'], [-7, '7'], [-5, '5'], [-3, '3'], [0, '0'], [3, '3']] as const) {
		const f = vuFrac(vu)
		const red = vu >= 0
		const [a1, b1] = pt(f, r)
		const [a2, b2] = pt(f, r + Math.min(r * 0.125, 10))
		s += `<line x1="${n(a1)}" y1="${n(b1)}" x2="${n(a2)}" y2="${n(b2)}" stroke="${red ? RED : INK}" stroke-width="1.2"/>`
		const [lx, ly] = pt(f, r + Math.min(r * 0.222, 18))
		s += plainText(n(lx), n(ly + labelSize * 0.36), label, { size: labelSize, fill: red ? RED : INK })
	}
	// "VU" and, under it, the calibration the needle reads against (shortened on narrow faces).
	const vuSize = n(Math.min(r * 0.22, 18))
	s += plainText(n(g.vu[0]), n(g.vu[1]), 'VU', { size: vuSize, fill: INK })
	const refSize = n(Math.max(8, vuSize * 0.55))
	s += plainText(n(g.vu[0]), n(g.vu[1] + vuSize * 0.75), w < 130 ? `${reference} dBFS` : `0 VU = ${reference} dBFS`, { size: refSize, fill: INK })
	const frac = (d: number) => vuFrac(d - reference)
	const shown = follow(id, muted ? -Infinity : safeDb(peakDb) - peakOffset, frac)
	const [nx, ny] = pt(frac(shown), r + Math.min(r * 0.083, 7))
	s += `<line x1="${n(cx)}" y1="${n(pivot)}" x2="${n(nx)}" y2="${n(ny)}" stroke="#111" stroke-width="1.6"/>`
	s += `</g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6" fill="none" stroke="#3a2608" stroke-width="2"/></g>`
	return [s, shown]
}

const loud = (l: number, r: number) => Math.max(safeDb(l), safeDb(r))
/** The needle's level in dBFS; nothing during silence. */
const dbfs = (db: number) => (db === -Infinity ? '' : `${db.toFixed(1)} dBFS`)
const text = (t: string, x: number, cy: number, size: number, maxWidth: number, fill = WHITE) => {
	if (!t) return ''
	const s = fitSize(t, size, maxWidth, 9)
	return plainText(x, base(cy, s), fitText(t, s, maxWidth + 4), { size: s, fill })
}

/** The Fader key look stretched sideways: name on top, a wide VU face, the fader value (MUTED while muted) under it. */
function strip(v: MeterInput): string {
	const right = v.badge ? 196 - fitText(v.badge.text, 13, 50).length * 8 - 6 : 196
	let b = text(v.name, (4 + right) / 2, 10, 16, right - 8)
	if (v.badge) b += plainText(196, base(10, 13), fitText(v.badge.text, 13, 50), { size: 13, fill: v.badge.fill, anchor: 'end' })
	b += face(6, 20, 188, 62, loud(v.leftDb, v.rightDb), v.muted, 'vs', { cx: 100, pivot: 130, r: 82, half: 48, vu: [100, 62] })[0]
	b += v.muted && !v.peek ? text('MUTED', 100, 91, 16, 190, MUTED_RED) : text(v.faderText, 100, 91, 16, 190)
	return frame(200, 100, b, v.overlay)
}

/**
 * The two keys are one picture (144x288 or 288x144), each key shows its half, so the face and its needle cross the seam.
 * Vertical: name and fader value on top, the scale in the top key and a long needle down through the seam, the level (or MUTED) at the bottom.
 * Horizontal: name top-left, fader value top-right, one wide face across both keys.
 */
function pair(v: MeterInput, role: FaderRole): string {
	const vertical = role === 'top' || role === 'bottom'
	const second = role === 'bottom' || role === 'right'
	const db = loud(v.leftDb, v.rightDb)
	let b: string
	if (vertical) {
		b = nameBlock(v.name, { x: 72, top: 4, width: 128, height: 32, maxLines: 1, size: 24, minSize: 13 })
		if (!v.muted) b += text(v.faderText, 72, 50, 24, 132)
		const [svg, shown] = face(6, 64, 132, 190, db, v.muted, 'vp', { cx: 72, pivot: 250, r: 150, half: 22, vu: [72, 214] })
		b += svg
		b += v.muted ? (v.peek ? text(v.faderText, 72, 272, 20, 128) : text('MUTED', 72, 272, 20, 128, MUTED_RED)) : text(dbfs(shown), 72, 272, 20, 128)
	} else {
		b = nameBlock(v.name, { x: 72, top: 2, width: 128, height: 26, maxLines: 1, size: 22, minSize: 12 })
		b += v.muted && !v.peek ? text('MUTED', 216, 14, 22, 128, MUTED_RED) : text(v.faderText, 216, 14, 22, 128)
		b += face(6, 32, 276, 106, db, v.muted, 'vp', { cx: 144, pivot: 168, r: 112, half: 48, vu: [70, 114] })[0]
	}
	const shift = second ? (vertical ? `translate(0 -${KEY})` : `translate(-${KEY} 0)`) : ''
	return frame(KEY, KEY, shift ? `<g transform="${shift}">${b}</g>` : b, v.overlay)
}

function key(v: MeterKeyInput): string {
	let b = text(v.title, 72, 18, 20, 128)
	b += face(8, 32, 128, 82, loud(v.meter.leftDb, v.meter.rightDb), v.meter.muted, 'vk')[0]
	b += v.meter.muted ? text('MUTED', 72, 130, 18, 128, MUTED_RED) : text(v.value, 72, 130, 18, 128)
	return frame(KEY, KEY, b, v.overlay)
}

export const vu: MeterDesign = { strip, pair, key }
