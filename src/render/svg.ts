export const KEY = 144

export type Overlay = 'none' | 'offline' | 'unsupported' | 'setup' | 'config'

// Same face, weight and plain fill (no outline) as Elgato's Spotify plugin. One family name only:
// the Stream Deck SVG renderer is not a browser, and Windows font fallback still covers Hangul.
const FONT = 'Segoe UI'
const WEIGHT = 600

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
	return (
		`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${opts.size}" font-weight="${WEIGHT}" ` +
		`text-anchor="${opts.anchor ?? 'middle'}" fill="${opts.fill}">${escapeXml(text)}</text>`
	)
}

// Hangul, CJK and full-width characters are about 1 em wide, the rest 0.6 em
const WIDE = /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]|[\u{20000}-\u{3ffff}]/u
const charWidth = (c: string, size: number) => (WIDE.test(c) ? 1 : 0.6) * size

// shortcut: per-class width estimate (no font metrics in Node); upgrade if cut-offs look wrong on a real key
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
