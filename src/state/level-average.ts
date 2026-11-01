// TotalMix's Global OSC only sends peak levels, so RMS and LUFS readings are averages of those peaks over time, not true measurements.
const samples = new Map<string, { at: number; energy: number }[]>()
const KEEP_MS = 3000

/** Adds the current level for this channel and returns its time-weighted energy over the window (each reading holds until the next). */
export function averageEnergy(channel: string, db: number, windowMs: number, now = Date.now()): number {
	const energy = 10 ** (db / 10)
	const list = samples.get(channel) ?? []
	samples.set(channel, list)
	list.push({ at: now, energy })
	while (list.length > 1 && list[1].at <= now - KEEP_MS) list.shift()
	let sum = 0
	let time = 0
	for (let i = 0; i + 1 < list.length; i++) {
		const span = list[i + 1].at - Math.max(list[i].at, now - windowMs)
		if (span <= 0) continue
		sum += list[i].energy * span
		time += span
	}
	return time > 0 ? sum / time : energy
}
