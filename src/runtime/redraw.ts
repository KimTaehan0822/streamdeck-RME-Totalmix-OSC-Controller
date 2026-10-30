export const REDRAW_MS = 40

/** Sends at most one image per REDRAW_MS; the latest render wins and identical images are not resent. */
export class Redrawer {
	private lastDrawAt = Number.NEGATIVE_INFINITY
	private lastImage?: string
	private pending?: () => string
	private timer?: unknown
	private disposed = false

	constructor(
		private readonly draw: (image: string) => Promise<void>,
		private readonly now: () => number = Date.now,
		private readonly schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
	) {}

	request(render: () => string): void {
		if (this.disposed) return
		this.pending = render
		if (this.timer !== undefined) return
		const wait = this.lastDrawAt + REDRAW_MS - this.now()
		if (wait <= 0) this.flush()
		else
			this.timer = this.schedule(() => {
				this.timer = undefined
				this.flush()
			}, wait)
	}

	dispose(): void {
		this.disposed = true
		this.pending = undefined
	}

	private flush(): void {
		const render = this.pending
		this.pending = undefined
		if (!render || this.disposed) return
		let image: string
		try {
			image = render()
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			return
		}
		if (image === this.lastImage) return
		this.lastImage = image
		this.lastDrawAt = this.now()
		// a failed draw must not stop the same image being retried
		this.draw(image).catch(() => {
			if (this.lastImage === image) this.lastImage = undefined
		})
	}
}
