export function asIndex(value: unknown, label: string): number {
	const number = Number(value)
	if (!Number.isInteger(number) || number < 0) throw new Error(`Invalid ${label}: ${String(value)}`)
	return number
}

export function asNumber(value: unknown, label: string): number {
	const number = Number(value)
	if (!Number.isFinite(number)) throw new Error(`Invalid ${label}: ${String(value)}`)
	return number
}
