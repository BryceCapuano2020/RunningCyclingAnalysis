import { describe, expect, it } from 'vitest'
import { DRIFT, DURABILITY_AFTER_S, LATE_IN_EFFORT } from '@rca/core/constants'
import {
  DECOUPLING_REFERENCE,
  driftChange,
  driftLede,
  durabilityLede,
  fadePercent,
  lateInEffort,
  medianOf,
} from './lateInEffort'
import { driftPoints, durabilityRow, lateEvidenceFor } from './lateFixtures'

const NONE = { durability: [], drift: [] }

describe('the copy keeps to the constants', () => {
  it('says "an hour" and the 5% reference for the numbers the digest and the app keep', () => {
    expect(DRIFT.minMovingS).toBe(3600)
    expect(DURABILITY_AFTER_S[0]).toBe(3600)
    expect(LATE_IN_EFFORT.minActivities).toBe(3)
    expect(DECOUPLING_REFERENCE).toBe(
      'A fall of 5%: under this is usually read as well-built endurance',
    )
  })
})

describe('the durability lede', () => {
  it('says how far the best at a duration is below the best at that duration overall after a time', () => {
    expect(durabilityLede(5400, 1200, 0.94)).toBe(
      'After 90 min your best 20 min is 6% below your best 20 min overall.',
    )
  })

  it('rounds to a whole percent, and reads under 1% as within 1%', () => {
    expect(durabilityLede(3600, 300, 0.9449)).toBe(
      'After 60 min your best 5 min is 6% below your best 5 min overall.',
    )
    expect(durabilityLede(3600, 300, 0.996)).toBe(
      'After 60 min your best 5 min is within 1% of your best 5 min overall.',
    )
    expect(fadePercent(1.03)).toBe(-3)
    expect(durabilityLede(7200, 300, 1.03)).toBe(
      'After 120 min your best 5 min is 3% above your best 5 min overall.',
    )
  })
})

describe('a sport’s late bests', () => {
  it('quote the deepest level that has enough activities, at its longest duration', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    // 120 min has 2 activities at 5 min and none at 20 min; 90 min has 4 at 20 min and 5 at 5 min.
    expect(durability!.lede).toBe(
      'After 90 min your best 20 min is 6% below your best 20 min overall.',
    )
  })

  it('keeps the activity count out of the lede and puts it in the note', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(durability!.lede).not.toMatch(/\d rides/)
    expect(durability!.note).toContain('Your best 20 min after 90 min rests on 4 rides.')
    expect(durability!.note).not.toContain('A level shows once')
    expect(durability!.note).toContain('Counts rides with a power meter.')
  })

  it('show a level only where at least 3 activities support it', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(durability!.groups.map((g) => [g.durationS, g.cells.map((c) => c.afterS)])).toEqual([
      [300, [3600, 5400]],
      [1200, [3600, 5400]],
    ])
  })

  it('read a run’s metabolic W/kg as the flat speed it costs, and the fall in that speed', () => {
    const { durability } = lateInEffort('run', lateEvidenceFor('run'))
    const group = durability!.groups[1]!
    expect(group.overall.value).toBeGreaterThan(2)
    expect(group.overall.value).toBeLessThan(6)
    const cell = group.cells[1]!
    expect(cell.retention).toBeCloseTo(cell.value / group.overall.value, 12)
    // The fall in speed is not the fall in W/kg: resting power comes off first.
    expect(cell.retention).not.toBeCloseTo(0.94, 3)
  })

  it('have nothing without a best overall, and nothing with 2 activities at every level', () => {
    const thin = {
      durability: [
        durabilityRow(300, 300, [{ value: 280, supporters: 2 }]),
        durabilityRow(1200, 260, [{ value: 250, supporters: 2 }]),
      ],
      drift: [],
    }
    expect(lateInEffort('ride', thin).durability).toBeNull()
    const noFresh = { durability: [{ ...thin.durability[0]!, fresh: null }], drift: [] }
    expect(lateInEffort('ride', noFresh).durability).toBeNull()
  })

  it('quote the 5 min best when no 20 min effort reaches the deepest level', () => {
    const evidence = {
      durability: [
        durabilityRow(300, 300, [null, null, { value: 270, supporters: 3 }]),
        durabilityRow(1200, 260, [{ value: 250, supporters: 5 }, null, null]),
      ],
      drift: [],
    }
    expect(lateInEffort('ride', evidence).durability!.lede).toBe(
      'After 120 min your best 5 min is 10% below your best 5 min overall.',
    )
  })
})

describe('the drift lede', () => {
  it('says the median fall from the first half to the second', () => {
    expect(driftLede('run', 3.2, 12)).toBe(
      'On steady runs over an hour, your output per heartbeat fell 3% from the first half to the second (median of 12 runs).',
    )
    expect(driftLede('ride', 6.4, 3)).toBe(
      'On steady rides over an hour, your output per heartbeat fell 6% from the first half to the second (median of 3 rides).',
    )
  })

  it('says a rise as a rise and a change under 1% as level', () => {
    expect(driftChange(-2.4)).toBe('rose 2%')
    expect(driftChange(0.4)).toBe('held level')
    expect(driftChange(-0.4)).toBe('held level')
    expect(driftChange(0.5)).toBe('fell 1%')
  })

  it('takes the median of the efforts, the mean of the middle two for an even count', () => {
    expect(medianOf([5, 1, 3])).toBe(3)
    expect(medianOf([1, 2, 3, 10])).toBe(2.5)
    const { drift } = lateInEffort('run', {
      durability: [],
      drift: driftPoints([1, 2, 3, 3, 4, 2, 5, 3, 6, 3, 4, 2]),
    })
    expect(drift!.lede).toContain('fell 3%')
    expect(drift!.lede).toContain('median of 12 runs')
  })

  it('shows from 3 steady efforts and not from 2', () => {
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3, 4]) }).drift).not.toBeNull()
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3]) }).drift).toBeNull()
  })

  it('names the warm-up and what else moves heart rate in its note', () => {
    const { drift } = lateInEffort('run', { ...NONE, drift: driftPoints([2, 3, 4]) })
    expect(drift!.note).toContain('after a 10-minute warm-up')
    expect(drift!.note).toContain('Heat, hydration and tiredness also move heart rate')
  })
})

describe('what the section needs', () => {
  it('has no need when both readings show', () => {
    expect(lateInEffort('run', lateEvidenceFor('run')).need).toBeNull()
  })

  it('names both needs when neither half shows', () => {
    expect(lateInEffort('run', NONE).need).toBe(
      'Add 3 runs longer than an hour. Needs 3 steady runs over an hour with heart rate to show how output per heartbeat changes.',
    )
    expect(lateInEffort('ride', NONE).need).toBe(
      'Add 3 rides longer than an hour with a power meter. Needs 3 steady rides over an hour with a power meter and heart rate to show how output per heartbeat changes.',
    )
  })

  it('names the late bests’ need alone when only drift shows', () => {
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3, 4]) }).need).toBe(
      'Add 3 runs longer than an hour.',
    )
  })

  it('counts the efforts a ride already has, and asks for a power meter', () => {
    const two = {
      durability: [durabilityRow(300, 300, [{ value: 280, supporters: 2 }])],
      drift: driftPoints([2, 3, 4]),
    }
    expect(lateInEffort('ride', two).need).toBe(
      'Add 1 ride longer than an hour with a power meter.',
    )
  })

  it('asks for steady efforts with heart rate when only drift is missing', () => {
    const { durability } = lateEvidenceFor('run')
    expect(lateInEffort('run', { durability, drift: [] }).need).toBe(
      'Needs 3 steady runs over an hour with heart rate to show how output per heartbeat changes.',
    )
  })

  it('never uses the words the owner rules out', () => {
    const texts = [
      lateInEffort('run', lateEvidenceFor('run')),
      lateInEffort('ride', lateEvidenceFor('ride')),
      lateInEffort('run', NONE),
    ].flatMap((r) => [r.durability?.lede, r.durability?.note, r.drift?.lede, r.drift?.note, r.need])
    for (const text of texts.filter((t): t is string => t !== undefined && t !== null)) {
      expect(text).not.toMatch(/limiter|weak|strength|holding you back|ahead of/i)
    }
  })
})
