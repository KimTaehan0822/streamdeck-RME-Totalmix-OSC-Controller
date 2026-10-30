import { KEY, fitText, frame, plainText, type Overlay } from './svg.js'

const WHITE = '#fff'

export interface ToggleKeyView {
	title: string
	label?: string
	on: boolean
	onColor: string
	overlay: Overlay
}

export function renderToggleKey(v: ToggleKeyView): string {
	let body = `<rect width="${KEY}" height="${KEY}" fill="${v.on ? v.onColor : '#000'}"/>`
	body += plainText(72, v.label ? 62 : 82, fitText(v.title, 26), { size: 26, fill: WHITE })
	if (v.label) body += plainText(72, 104, fitText(v.label, 26), { size: 26, fill: WHITE })
	return frame(KEY, KEY, body, v.overlay)
}

export interface ValueKeyView {
	title: string
	value: string
	bar?: number
	overlay: Overlay
}

export function renderValueKey(v: ValueKeyView): string {
	let body = plainText(72, 40, fitText(v.title, 26), { size: 26, fill: WHITE })
	// A value too wide at 34 px (e.g. "-12.5 dB") steps down to 26 px before it is cut.
	const size = fitText(v.value, 34) === v.value ? 34 : 26
	body += plainText(72, 90, fitText(v.value, size), { size, fill: WHITE })
	if (v.bar !== undefined) {
		const w = Math.round(Math.min(1, Math.max(0, v.bar)) * 124)
		body += `<rect x="10" y="108" width="124" height="14" fill="#333"/><rect x="10" y="108" width="${w}" height="14" fill="rgb(40,140,255)"/>`
	}
	return frame(KEY, KEY, body, v.overlay)
}

export interface SnapshotKeyView {
	number: number | undefined
	active: boolean
	mode: 'recall' | 'show'
	overlay: Overlay
}

export function renderSnapshotKey(v: SnapshotKeyView): string {
	const n = v.number === undefined ? '?' : String(v.number)
	let body = `<rect width="${KEY}" height="${KEY}" fill="${v.active ? 'rgb(0,65,72)' : '#000'}"/>`
	body += plainText(72, 40, v.mode === 'show' ? 'SNAPSHOT' : 'RECALL', { size: 22, fill: WHITE })
	body += plainText(72, 104, n, { size: 56, fill: v.active ? 'rgb(0,205,215)' : WHITE })
	return frame(KEY, KEY, body, v.overlay)
}

export interface ValueStripView {
	title: string
	value: string
	bar?: number
	/** Small text at the bottom right, e.g. a missing feature. */
	note?: string
	overlay: Overlay
}

/** Dial strip (200x100): title, bar growing from the left, value. */
export function renderValueStrip(v: ValueStripView): string {
	let body = plainText(100, 28, fitText(v.title, 21, 192), { size: 21, fill: WHITE })
	if (v.bar !== undefined) {
		const w = Math.round(Math.min(1, Math.max(0, v.bar)) * 180)
		body += `<rect x="10" y="50" width="180" height="14" fill="#333"/><rect x="10" y="50" width="${w}" height="14" fill="rgb(40,140,255)"/>`
	}
	body += plainText(100, 92, fitText(v.value, 19, 120), { size: 19, fill: WHITE })
	if (v.note) body += plainText(192, 92, v.note, { size: 13, fill: 'rgb(150,150,150)', anchor: 'end' })
	return frame(200, 100, body, v.overlay)
}
