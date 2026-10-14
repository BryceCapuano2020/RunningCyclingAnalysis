import { describe, expect, it } from 'vitest'
import { DEFAULT_ATHLETE } from './athlete'
import { sampleDataset } from './dataset'

const DAY_MS = 86_400_000
const END_MS = 1_750_000_000_000

function durations(sport: 'run' | 'ride', all: { sport: string; n: number }[]): number[] {
  return all
    .filter((a) => a.sport === sport)
    .map((a) => a.n)
    .sort((x, y) => x - y)
}

describe('sampleDataset', () => {
  const { athlete, activities } = sampleDataset()

  it('uses the default athlete', () => {
    expect(athlete).toEqual(DEFAULT_ATHLETE)
  })

  it('has six runs and eight rides', () => {
    expect(activities).toHaveLength(14)
    expect(activities.filter((a) => a.sport === 'run')).toHaveLength(6)
    expect(activities.filter((a) => a.sport === 'ride')).toHaveLength(8)
  })

  it('uses realistic activity titles that do not describe the simulation', () => {
    expect(activities.map((a) => a.name).sort()).toEqual(
      [
        '5K and 10K Time Trials',
        'Canyon Climb',
        'Evening Ride',
        'Hill Repeats',
        'Lunch Run',
        'Morning Run',
        'Mountain Climb',
        'Power Test',
        'Saturday Long Ride',
        'Sunday Long Run',
        'Tempo Ride',
        'Tempo Run',
        'Track Intervals',
        'VO2 Intervals',
      ].sort(),
    )
    for (const a of activities) {
      expect(a.name).not.toMatch(/Glitch|Flat|Rolling|With HR|Simulat|Synthetic/)
    }
  })

  it('has eight rides, exactly one of them without power', () => {
    const rides = activities.filter((a) => a.sport === 'ride')
    expect(rides).toHaveLength(8)
    const noPower = rides.filter((a) => !a.hasPower)
    expect(noPower).toHaveLength(1)
    expect(noPower[0]!.name).toBe('Mountain Climb')
    expect(noPower[0]!.power.every(Number.isNaN)).toBe(true)
  })

  it('gives every activity n equal to its spec duration', () => {
    expect(durations('run', activities)).toEqual([2700, 2700, 3000, 3300, 4200, 6000])
    expect(durations('ride', activities)).toEqual([4200, 4500, 4800, 4800, 5400, 5400, 6600, 7200])
  })

  it('spreads activities over the eight weeks before the fixed reference time', () => {
    const starts = activities.map((a) => a.startMs)
    for (const s of starts) {
      expect(s).toBeGreaterThanOrEqual(END_MS - 56 * DAY_MS)
      expect(s).toBeLessThan(END_MS)
    }
    expect(new Set(starts).size).toBe(activities.length)
    expect(new Set(activities.map((a) => a.id)).size).toBe(activities.length)
  })

  it('includes a ride with a heart-rate glitch that has heart rate outside the glitch', () => {
    const glitch = activities.find((a) => a.name === 'Evening Ride')!
    expect(glitch.hasHeartRate).toBe(true)
    expect(glitch.heartRate.slice(0, Math.floor(0.4 * glitch.n)).some((h) => h > 105)).toBe(true)
  })

  it('is deterministic by default and for an explicit seed of 1', () => {
    const again = sampleDataset(1)
    expect(again.activities.map((a) => a.id)).toEqual(activities.map((a) => a.id))
    expect(again.activities[0]!.speed).toEqual(activities[0]!.speed)
    expect(again.activities[13]!.heartRate).toEqual(activities[13]!.heartRate)
  })

  it('changes the recorded data for a different seed', () => {
    const other = sampleDataset(2)
    expect(other.activities[0]!.speed).not.toEqual(activities[0]!.speed)
  })
})
