import { describe, expect, it } from 'vitest'
import { workoutKey } from '@rca/core/session'
import { makeActivity } from '../components/fixtures'
import {
  countRunsLabel,
  leftOutNote,
  leftOutRuns,
  walkingPaceText,
  workoutKeyOf,
} from './walkingPaceCopy'

describe('walking pace copy', () => {
  it('tells how a left-out run can be counted, in the singular and the plural', () => {
    expect(leftOutNote(1)).toBe(
      '1 run is at walking pace, so it is left out. Count it as a run to include it.',
    )
    expect(leftOutNote(3)).toBe(
      '3 runs are at walking pace, so they are left out. Count them as runs to include them.',
    )
    expect(countRunsLabel(1)).toBe('Count this run')
    expect(countRunsLabel(3)).toBe('Count these runs')
  })

  it('points the note under the notices at the activity page, where one run is counted', () => {
    expect(walkingPaceText(2)).toMatch(/Open one to count it as a run\.$/)
    expect(walkingPaceText(1)).toMatch(/Open it to count it as a run\.$/)
  })

  it('keys a run by its sport and start second, as the library keys a workout', () => {
    const run = makeActivity({ sport: 'run', startMs: 1_700_000_123_456 })
    expect(workoutKeyOf(run)).toBe(workoutKey('run', 1_700_000_123_456))
  })
})

describe('leftOutRuns', () => {
  const hike = makeActivity({ id: 'h', walkingPace: true })
  const run = makeActivity({ id: 'r' })
  const ride = makeActivity({ id: 'd', sport: 'ride' })

  it('is all left out when no run of the sport is analysed, whatever else is on file', () => {
    expect(leftOutRuns([hike, ride])).toEqual({ runs: [hike], allLeftOut: true })
  })

  it('is not all left out once a run is analysed', () => {
    expect(leftOutRuns([hike, run])).toEqual({ runs: [hike], allLeftOut: false })
  })

  it('has nothing left out of a library with no walking-pace run', () => {
    expect(leftOutRuns([run, ride])).toEqual({ runs: [], allLeftOut: false })
  })
})
