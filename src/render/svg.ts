export const KEY = 144
/** Widest a name may be on a key: the key's edges sit under the device's bezel. */
export const NAME_WIDTH = KEY - 16

export type Overlay = 'none' | 'offline' | 'unsupported' | 'setup' | 'config'

// Same face, weight and plain fill (no outline) as Elgato's Spotify plugin. One family name only:
// the Stream Deck SVG renderer is not a browser.
const FONT = 'Segoe UI'
const WEIGHT = 600
// Segoe UI has no Hangul and the fallback draws it thin; Malgun Gothic has only Regular and Bold, and Bold matches Segoe's 600.
const HANGUL_FONT = 'Malgun Gothic'
const HANGUL_WEIGHT = 700
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/
// Hangul stands much taller than Latin at the same size and ran into the key edge and the meter bars.
const HANGUL_SCALE = 0.82

export function svgDataUrl(svg: string): string {
	return 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(svg)
}

export function escapeXml(text: string): string {
	return text
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function plainText(
	x: number,
	y: number,
	text: string,
	opts: { size: number; fill: string; anchor?: 'start' | 'middle' | 'end' },
): string {
	const hangul = HANGUL.test(text)
	const size = hangul ? +(opts.size * HANGUL_SCALE).toFixed(1) : opts.size
	return (
		`<text x="${x}" y="${y}" font-family="${hangul ? HANGUL_FONT : FONT}" font-size="${size}" font-weight="${hangul ? HANGUL_WEIGHT : WEIGHT}" ` +
		`text-anchor="${opts.anchor ?? 'middle'}" fill="${opts.fill}">${escapeXml(text)}</text>`
	)
}

// Hangul and other CJK and full-width characters are about 1 em wide (Hangul drawn at HANGUL_SCALE), the rest 0.6 em
const WIDE = /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]|[\u{20000}-\u{3ffff}]/u
// Printable ASCII advance widths of Segoe UI Semibold in hundredths of an em, measured in a browser (Node has no font metrics).
const SEGOE = [
	27, 30, 44, 59, 56, 84, 72, 26, 33, 33, 43, 69, 24, 40, 24, 41, 56, 40, 56, 56, 58, 56, 56, 54, 56, 56, 24, 24, 69, 69, 69, 44,
	95, 67, 60, 62, 72, 52, 50, 70, 74, 29, 40, 61, 49, 92, 77, 76, 58, 76, 62, 54, 55, 70, 64, 97, 62, 58, 59, 33, 40, 33, 69, 42,
	29, 52, 60, 47, 60, 53, 34, 60, 58, 26, 26, 52, 26, 89, 58, 60, 60, 60, 37, 43, 36, 58, 51, 76, 50, 51, 46, 33, 28, 33, 69,
]
// 5% over the measured widths so rounding in the Stream Deck renderer never pushes text past the edge.
const MARGIN = 1.05
const charWidth = (c: string, size: number) => {
	const code = c.codePointAt(0) ?? 0
	if (code >= 32 && code < 127) return (SEGOE[code - 32] / 100) * MARGIN * size
	return (HANGUL.test(c) ? HANGUL_SCALE : WIDE.test(c) ? 1 : 0.6) * size
}

export function fitText(text: string, size: number, maxWidth = KEY - 8): string {
	const chars = Array.from(text)
	if (chars.reduce((w, c) => w + charWidth(c, size), 0) <= maxWidth) return text
	let out = ''
	let w = charWidth('…', size)
	for (const c of chars) {
		w += charWidth(c, size)
		if (w > maxWidth) break
		out += c
	}
	return out + '…'
}

/** Font size at which text fits maxWidth, never above size nor below min (fitText still cuts what min cannot fit). */
export function fitSize(text: string, size: number, maxWidth: number, min: number): number {
	const width = Array.from(text).reduce((w, c) => w + charWidth(c, size), 0)
	// The small margin keeps float rounding from pushing the result just past maxWidth, which fitText would cut.
	return width <= maxWidth ? size : Math.max(min, Math.floor((size * maxWidth) / width - 1e-6))
}

/** Text that would shrink below 85% of size on one line splits at the space that lets both lines be largest. */
export function wrapFit(text: string, size: number, maxWidth: number, min: number): { lines: string[]; size: number } {
	let best = { lines: [text], size: fitSize(text, size, maxWidth, min) }
	const words = text.split(' ')
	if (best.size >= size * 0.85) return best
	for (let i = 1; i < words.length; i++) {
		const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
		const s = Math.min(...lines.map((line) => fitSize(line, size, maxWidth, min)))
		if (s > best.size) best = { lines, size: s }
	}
	return best
}

/** Lines centred as a block on cy. */
export function textBlock(block: { lines: string[]; size: number }, cy: number, fill: string): string {
	const { lines, size } = block
	const step = size * 1.1
	const first = cy - (step * (lines.length - 1)) / 2 + size * 0.35
	return lines.map((line, i) => plainText(72, +(first + i * step).toFixed(1), fitText(line, size), { size, fill })).join('')
}

export function frame(width: number, height: number, body: string, overlay: Overlay): string {
	const cx = width / 2
	const cy = height / 2
	let content: string
	switch (overlay) {
		case 'offline':
			content = `<g opacity="0.35">${body}</g>` + plainText(cx, cy + 8, 'OFFLINE', { size: 24, fill: 'rgb(255,57,31)' })
			break
		case 'unsupported':
			content = `<g opacity="0.25">${body}</g>` + plainText(cx, cy + 12, 'N/A', { size: 34, fill: 'rgb(150,150,150)' })
			break
		case 'setup':
			content =
				`<g opacity="0.35">${body}</g>` +
				plainText(cx, cy - 6, 'SET', { size: 26, fill: '#fff' }) +
				plainText(cx, cy + 24, 'CHANNEL', { size: 26, fill: '#fff' })
			break
		case 'config':
			content = `<g opacity="0.35">${body}</g>` + plainText(cx, cy + 8, 'SETUP', { size: 26, fill: '#fff' })
			break
		default:
			content = body
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<rect width="${width}" height="${height}" fill="#000"/>${content}</svg>`
	)
}
