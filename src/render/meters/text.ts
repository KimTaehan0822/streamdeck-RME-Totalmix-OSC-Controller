// Name wrapping ported from the OBS audio plugin (src/render/text.ts), on this plugin's text measurements.
import { fitText, plainText, textWidth } from '../svg.js'

export const LINE_HEIGHT = 1.15
const CJK = /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿]/

function wrap(name: string, size: number, maxWidth: number, splitLatin = true): string[] | null {
	const lines: string[] = []
	let line = ''
	let ok = true
	const push = (piece: string, sep: string) => {
		const next = line ? line + sep + piece : piece
		if (textWidth(next, size) <= maxWidth) return void (line = next)
		if (line) lines.push(line)
		line = ''
		if (textWidth(piece, size) <= maxWidth) return void (line = piece)
		const parts = piece.split(/(?<=[.\-_])(?=.)|(?<=[a-z])(?=[A-Z])/)
		if (parts.length > 1 && parts.every((p) => textWidth(p, size) <= maxWidth)) {
			for (const part of parts) {
				if (line && textWidth(line + part, size) > maxWidth) {
					lines.push(line)
					line = ''
				}
				line += part
			}
			return
		}
		if (!splitLatin && !CJK.test(piece)) ok = false
		for (const c of Array.from(piece)) {
			if (line && textWidth(line + c, size) > maxWidth) {
				lines.push(line)
				line = ''
			}
			line += c
		}
	}
	for (const word of name.trim().split(/\s+/)) if (word) push(word, ' ')
	if (line) lines.push(line)
	return ok ? lines : null
}

/** Wraps a name onto at most maxLines lines (and maxHeight), shrinking towards minSize first; only then the last line is cut. */
export function wrapName(name: string, size: number, maxWidth: number, maxLines: number, minSize: number, maxHeight = Infinity): { lines: string[]; size: number } {
	if (!name.trim()) return { lines: [], size }
	const sizes: number[] = []
	for (let s = size; s > minSize; s--) sizes.push(s)
	sizes.push(minSize)
	for (const splitLatin of [false, true])
		for (const s of sizes) {
			const lines = wrap(name, s, maxWidth, splitLatin)
			if (lines && lines.length <= maxLines && lines.length * s * LINE_HEIGHT <= maxHeight) return { lines, size: s }
		}
	const fitLines = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (minSize * LINE_HEIGHT))))
	const lines = wrap(name, minSize, maxWidth) as string[]
	const kept = lines.slice(0, fitLines - 1)
	kept.push(fitText(lines.slice(fitLines - 1).join(/\s/.test(name.trim()) ? ' ' : ''), minSize, maxWidth))
	return { lines: kept, size: minSize }
}

export interface NameBox {
	x: number
	top: number
	width: number
	height: number
	maxLines: number
	size: number
	minSize: number
	anchor?: 'start' | 'middle' | 'end'
	fill?: string
}

/** The wrapped name drawn from the top of its box. */
export function nameBlock(name: string, b: NameBox): string {
	const { lines, size } = wrapName(name, b.size, b.width, b.maxLines, b.minSize, b.height)
	return lines
		.map((line, i) => plainText(b.x, +(b.top + size * 0.9 + i * size * LINE_HEIGHT).toFixed(2), line, { size, fill: b.fill ?? '#fff', anchor: b.anchor }))
		.join('')
}
