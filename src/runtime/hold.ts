/** Steps once at start(), then after delayMs and every intervalMs until stop(). */
export class HoldRepeater {
	private timer?: unknown

	constructor(
		private readonly step: () => void,
		private readonly delayMs = 400,
		private readonly intervalMs = 150,
		private readonly schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
		private readonly cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as NodeJS.Timeout),
	) {}

	start(): void {
		this.stop()
		this.step()
		this.arm(this.delayMs)
	}

	stop(): void {
		if (this.timer !== undefined) this.cancel(this.timer)
		this.timer = undefined
	}

	private arm(ms: number): void {
		this.timer = this.schedule(() => {
			this.step()
			this.arm(this.intervalMs)
		}, ms)
	}
}
