// Shared meter designs. This folder uses nothing plugin-specific (only ../svg.js), so it can be copied to the other audio plugins.
import type { Overlay } from '../svg.js'

export type FaderRole = 'top' | 'bottom' | 'left' | 'right'

/** What every design draws from: levels and fader in dB, texts already formatted by the plugin. */
export interface MeterInput {
	name: string
	/** dBFS; -Infinity is silence. */
	leftDb: number
	rightDb: number
	/** Mixer fader in dB, or a plain 0..1 position (a gain) that designs place linearly. */
	fader?: { db: number } | { linear: number }
	faderText: string
	levelText: string
	muted: boolean
	/** Muted, but the fader was adjusted a moment ago: the fader text shows where MUTED would be. */
	peek: boolean
	/** Small tag at the top right of a dial strip, e.g. 48V. */
	badge?: { text: string; fill: string }
	overlay: Overlay
}

/** A value key (Fader key) with a meter: title at the top, the value text, the meter. */
export interface MeterKeyInput {
	title: string
	value: string
	meter: Pick<MeterInput, 'leftDb' | 'rightDb' | 'fader' | 'muted'>
	overlay: Overlay
}

export interface MeterDesign {
	strip(v: MeterInput): string
	pair(v: MeterInput, role: FaderRole): string
	key(v: MeterKeyInput): string
}

export const MUTED_RED = 'rgb(255,57,31)'
export const n = (x: number): number => +x.toFixed(2)
export const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : x > 0 ? 1 : 0)
/** Vertical text centre -> SVG baseline. */
export const base = (cy: number, size: number): number => n(cy + size * 0.35)
/** dB where silence is -Infinity (or NaN) and anything else is kept. */
export const safeDb = (db: number): number => (Number.isNaN(db) ? -Infinity : db)
