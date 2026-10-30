export const KEY = 144

export type Overlay = 'none' | 'offline' | 'unsupported' | 'setup'

const FONT = 'Arial, Helvetica, sans-serif'

export function svgDataUrl(svg: string): string {
	return 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(svg)
}

export function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function outlinedText(
	x: number,
	y: number,
	text: string,
	opts: { size: number; fill: string; anchor?: 'start' | 'middle' | 'end' },
): string {
	return (
		`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${opts.size}" font-weight="bold" ` +
		`text-anchor="${opts.anchor ?? 'middle'}" fill="${opts.fill}" stroke="#000" stroke-width="${Math.max(2, opts.size / 8)}" ` +
		`paint-order="stroke" stroke-linejoin="round">${escapeXml(text)}</text>`
	)
}

// shortcut: width is a flat 0.6 em per character (no font metrics in Node); upgrade if cut-offs look wrong on a real key
export function fitText(text: string, size: number, maxWidth = KEY - 8): string {
	const max = Math.floor(maxWidth / (size * 0.6))
	return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '…'
}

export function frame(width: number, height: number, body: string, overlay: Overlay): string {
	const cx = width / 2
	const cy = height / 2
	let content: string
	switch (overlay) {
		case 'offline':
			content = `<g opacity="0.35">${body}</g>` + outlinedText(cx, cy + 8, 'OFFLINE', { size: 24, fill: 'rgb(255,57,31)' })
			break
		case 'unsupported':
			content = `<g opacity="0.25">${body}</g>` + outlinedText(cx, cy + 12, 'N/A', { size: 34, fill: 'rgb(150,150,150)' })
			break
		case 'setup':
			content = `<g opacity="0.35">${body}</g>` + outlinedText(cx, cy + 8, 'SET CHANNEL', { size: 20, fill: '#fff' })
			break
		default:
			content = body
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<rect width="${width}" height="${height}" fill="#000"/>${content}</svg>`
	)
}
