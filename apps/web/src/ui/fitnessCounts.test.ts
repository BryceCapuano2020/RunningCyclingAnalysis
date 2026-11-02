import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { makeActivity } from './components/fixtures'
import { fitnessCountLine } from './fitnessCounts'

/** What an activity of each sport has when its fitness sensor is there, and when it is not. */
const SENSOR: Record<Sport, (has: boolean) => Partial<ActivitySummary>> = {
  run: (has) => ({ hasHeartRate: has }),
  ride: (has) => ({ powerSource: has ? 'measured' : 'virtual' }),
}

/** A library of `total` activities of a sport, the first `measured` of them with what fitness reads. */
function library(sport: Sport, measured: number, total: number): ActivitySummary[] {
  return Array.from({ length: total }, (_, i) =>
    makeActivity({ id: `${sport}-${i}`, sport, ...SENSOR[sport](i < measured) }),
  )
}

describe('fitnessCountLine', () => {
  it('says why a ride has no fitness yet, with how many rides have a power meter', () => {
    expect(fitnessCountLine(library('ride', 4, 31), 'ride')).toBe(
      '4 of 31 rides have a power meter. Fitness needs more.',
    )
  })

  it('says it of a run by heart rate, from the same table', () => {
    expect(fitnessCountLine(library('run', 9, 26), 'run')).toBe(
      '9 of 26 runs have heart rate. Fitness needs more.',
    )
  })

  it('counts only the sport’s own activities, and takes a ride’s virtual power as no meter', () => {
    const mixed = [...library('ride', 2, 5), ...library('run', 0, 40)]
    expect(fitnessCountLine(mixed, 'ride')).toBe(
      '2 of 5 rides have a power meter. Fitness needs more.',
    )
    expect(fitnessCountLine(mixed, 'run')).toBeNull()
  })

  it('groups thousands', () => {
    expect(fitnessCountLine(library('ride', 1, 1234), 'ride')).toBe(
      '1 of 1,234 rides have a power meter. Fitness needs more.',
    )
  })

  it('leaves the asking to the sport’s own line when none has the sensor, and the steady count when all do', () => {
    expect(fitnessCountLine(library('ride', 0, 31), 'ride')).toBeNull()
    expect(fitnessCountLine(library('ride', 31, 31), 'ride')).toBeNull()
    expect(fitnessCountLine([], 'ride')).toBeNull()
  })
})
