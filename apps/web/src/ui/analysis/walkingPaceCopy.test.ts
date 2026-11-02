import { describe, expect, it } from 'vitest'
import { workoutKey } from '@rca/core/session'
import { makeActivity } from '../components/fixtures'
import {
  ATHLETE_LABEL_CHIP,
  countRunsLabel,
  labelledNote,
  labelledText,
  leftOutNote,
  leftOutRuns,
  walkingPaceText,
  withoutWalking,
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
    expect(walkingPaceText(2)).toBe(
      '2 saved runs are at walking pace. They stay in your activities and are left out of your run analysis. Open one to count it as a run.',
    )
    expect(walkingPaceText(1)).toBe(
      '1 saved run is at walking pace. It stays in your activities and is left out of your run analysis. Open it to count it as a run.',
    )
    expect(walkingPaceText(2, false)).not.toContain('Open')
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

describe('activities the athlete labelled', () => {
  const hike = makeActivity({ id: 'h', athleteType: 'hike' })
  const both = makeActivity({ id: 'b', athleteType: 'walk', walkingPace: true })
  const run = makeActivity({ id: 'r' })

  it('are left out of the library the analysis rests on, with those at walking pace', () => {
    expect(withoutWalking([hike, both, run])).toEqual([run])
  })

  it('are said apart from the runs left out at walking pace, which the athlete counts by their pace', () => {
    expect(leftOutRuns([hike, both, run])).toEqual({ runs: [], allLeftOut: false })
    const walking = makeActivity({ id: 'w', walkingPace: true })
    expect(leftOutRuns([hike, walking])).toEqual({ runs: [walking], allLeftOut: true })
  })

  it('have a note under the notices and one on the activity page, naming the label', () => {
    expect(labelledText(1)).toBe(
      '1 saved activity is labelled Hike, Walk or another type in your export. It stays in your activities and is left out of your analysis. Open it to count it as a run or ride.',
    )
    expect(labelledText(3)).toMatch(/^3 saved activities are labelled .* They stay .* are left out/)
    expect(labelledNote('hike')).toBe(
      'You labelled this activity Hike in your export. It is left out of your run and ride analysis.',
    )
    expect(ATHLETE_LABEL_CHIP.ski).toBe('Ski')
  })
})
