import { describe, expect, it } from 'vitest'
import { HR_SET_ASIDE_FLOOR, HR_SET_ASIDE_MIN_S } from '../constants'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { heartRateSetAside, worstSetAside, type SetAsideInput } from './setAside'

function point(durationS: number, value: number, heartRate: number | null): DigestCurvePoint {
  return { durationS, value, startIndex: 0, windowS: durationS, heartRate, terms: null }
}

function digest(over: Partial<ActivityDigest> & { curve: DigestCurvePoint[] }): ActivityDigest {
  return {
    id: 'a',
    sport: 'ride',
    hasHeartRate: true,
    indoor: false,
    powerSource: 'measured',
    flagCounts: {},
    flags: [],
    ...over,
  } as ActivityDigest
}

const input: SetAsideInput = {
  threshold: { run: 15, ride: 250 },
  referenceHr: { run: 190, ride: 184 },
  valueOf: (_digest, p) => p.value,
}
const floor = HR_SET_ASIDE_FLOOR * 184

describe('heartRateSetAside', () => {
  it('sets aside a ride whose heart rate stayed under the floor through 10 min at threshold', () => {
    const ride = digest({ curve: [point(HR_SET_ASIDE_MIN_S, 250, floor - 1)] })
    expect(heartRateSetAside([ride], input)).toEqual(new Set(['a']))
  })

  it('keeps heart rate at the floor, below threshold or over a shorter effort', () => {
    const atFloor = digest({ id: 'floor', curve: [point(600, 300, floor)] })
    const easy = digest({ id: 'easy', curve: [point(600, 249, 100)] })
    const short = digest({ id: 'short', curve: [point(HR_SET_ASIDE_MIN_S - 1, 300, 100)] })
    expect(heartRateSetAside([atFloor, easy, short], input).size).toBe(0)
  })

  it('sets aside a hard effort whose heart rate was flagged as too low for the power in it', () => {
    const lowFlag = (start: number, end: number) => ({
      kind: 'hr-implausible-for-power' as const,
      start,
      end,
      message: '',
    })
    const flagged = digest({ curve: [point(600, 320, null)], flags: [lowFlag(300, 400)] })
    const elsewhere = digest({
      id: 'elsewhere',
      curve: [point(600, 320, null)],
      flags: [lowFlag(600, 700)],
    })
    const dropped = digest({ id: 'dropout', curve: [point(600, 320, null)] })
    expect(heartRateSetAside([flagged, elsewhere, dropped], input)).toEqual(new Set(['a']))
  })

  it('names the activity furthest below the floor first, then by id', () => {
    const low = digest({ id: 'b', curve: [point(600, 300, 100)] })
    const lower = digest({ id: 'c', curve: [point(600, 300, 90)] })
    const tied = digest({ id: 'a', curve: [point(600, 300, 90)] })
    expect(worstSetAside([low, lower, tied], input)).toBe('a')
    expect(worstSetAside([digest({ curve: [point(600, 300, 170)] })], input)).toBeNull()
  })

  it('never judges heart rate against estimated watts or a treadmill pace', () => {
    const virtual = digest({ id: 'v', powerSource: 'virtual', curve: [point(600, 300, 90)] })
    const treadmill = digest({
      id: 't',
      sport: 'run',
      powerSource: 'none',
      indoor: true,
      curve: [point(600, 16, 90)],
    })
    expect(heartRateSetAside([virtual, treadmill], input).size).toBe(0)
  })

  it('judges an outdoor run against the running threshold and reference', () => {
    const run = digest({ sport: 'run', powerSource: 'none', curve: [point(900, 15, 120)] })
    expect(heartRateSetAside([run], input)).toEqual(new Set(['a']))
    const noReference = { ...input, referenceHr: { run: null, ride: 184 } }
    expect(heartRateSetAside([run], noReference).size).toBe(0)
  })

  it('leaves a sport alone without a threshold, and skips windows that do not exist', () => {
    const noThreshold = { ...input, threshold: { run: 15, ride: null } }
    expect(heartRateSetAside([digest({ curve: [point(600, 300, 90)] })], noThreshold).size).toBe(0)
    const noWindow = digest({ curve: [{ ...point(600, 300, 90), startIndex: -1 }] })
    expect(heartRateSetAside([noWindow], input).size).toBe(0)
  })
})
