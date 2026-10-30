import assert from 'node:assert/strict'
import test from 'node:test'
import { dbToBar, dbToNormalized, formatDb, normalizedToDb } from '../dist/protocol/fader-curve.js'

test('official TotalMix curve matches observed 0.66 feedback', () => {
	assert.ok(Math.abs(normalizedToDb(0.66) - -5.16) < 0.02)
})

test('fader conversion round-trips representative values', () => {
	for (const db of [-65, -40, -20, -6, 0, 6]) {
		assert.ok(Math.abs(normalizedToDb(dbToNormalized(db)) - db) < 0.0001, `${db} dB did not round-trip`)
	}
})

test('fader conversion clamps both ends', () => {
	assert.equal(dbToNormalized(-100), 0)
	assert.equal(dbToNormalized(20), 1)
	assert.equal(normalizedToDb(-1), -65)
	assert.ok(Math.abs(normalizedToDb(2) - 6) < 0.0001)
})

test('formatDb never shows a negative zero for values just below 0 dB', () => {
	assert.equal(formatDb(-0.01), '0.0 dB')
	assert.equal(formatDb(-0.04), '0.0 dB')
	assert.equal(formatDb(-0.06), '-0.1 dB')
	assert.equal(formatDb(-1), '-1.0 dB')
})

test('bars move the same distance for every dB from -65 to +6', () => {
	assert.equal(dbToBar(-65), 0)
	assert.equal(dbToBar(-29.5), 0.5)
	assert.equal(dbToBar(6), 1)
	assert.equal(dbToBar(-100), 0)
	assert.equal(dbToBar(20), 1)
	assert.ok(Math.abs(dbToBar(-59) - dbToBar(-60) - (dbToBar(1) - dbToBar(0))) < 1e-9)
})
