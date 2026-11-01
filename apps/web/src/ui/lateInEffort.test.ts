import { describe, expect, it } from 'vitest'
import { DRIFT, DURABILITY_AFTER_S, LATE_IN_EFFORT } from '@rca/core/constants'
import {
  DECOUPLING_REFERENCE,
  afterWords,
  driftChange,
  durabilityStat,
  lateFinding,
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
    expect(DECOUPLING_REFERENCE).toBe('A fall of 5%: a common coaching reference line')
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
      'On steady runs over an hour, efficiency fell 3% from the first half to the second (median of 12 runs).',
    )
    expect(driftLede('ride', 6.4, 3)).toBe(
      'On steady rides over an hour, efficiency fell 6% from the first half to the second (median of 3 rides).',
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
    expect(lateInEffort('run', lateEvidenceFor('run')).needs).toEqual([])
  })

  it('is one line to add when neither half has anything, since steady efforts over an hour give both', () => {
    expect(lateInEffort('run', NONE).needs).toEqual([
      'Add 3 steady runs over an hour with heart rate.',
    ])
    expect(lateInEffort('ride', NONE).needs).toEqual([
      'Add 3 steady rides over an hour with a power meter and heart rate.',
    ])
  })

  it('names the durability need alone when only drift shows', () => {
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3, 4]) }).needs).toEqual([
      'Durability needs 3 runs longer than an hour.',
    ])
  })

  it('asks for a power meter on a ride, and never for a hard heart rate', () => {
    const two = {
      durability: [durabilityRow(300, 300, [{ value: 280, supporters: 2 }])],
      drift: driftPoints([2, 3, 4]),
    }
    const [need] = lateInEffort('ride', two).needs
    expect(need).toBe('Durability needs 3 rides longer than an hour with a power meter.')
    expect(need).not.toMatch(/hard|reference/)
  })

  it('asks for steady efforts with heart rate when only drift is missing', () => {
    const { durability } = lateEvidenceFor('run')
    expect(lateInEffort('run', { durability, drift: [] }).needs).toEqual([
      'Heart rate drift needs 3 steady runs over an hour with heart rate.',
    ])
  })

  it('never uses the words the owner rules out', () => {
    const texts = [
      lateInEffort('run', lateEvidenceFor('run')),
      lateInEffort('ride', lateEvidenceFor('ride')),
      lateInEffort('run', NONE),
    ].flatMap((r) =>
      [r.durability?.lede, r.durability?.note, r.drift?.lede, r.drift?.note].concat(r.needs),
    )
    for (const text of texts.filter((t): t is string => t !== undefined && t !== null)) {
      expect(text).not.toMatch(/limiter|weak|strength|holding you back|ahead of/i)
    }
  })
})

describe('the durability stat', () => {
  it('says the share of output held after a time, in whole percent', () => {
    expect(durabilityStat(1200, 3600, 0.99)).toBe('Best 20 min held 99% after an hour')
    expect(durabilityStat(300, 5400, 0.941)).toBe('Best 5 min held 94% after 90 min')
    expect(durabilityStat(1200, 7200, 0.8149)).toBe('Best 20 min held 81% after 2 hours')
  })

  it('rounds the share and not the fall, so a best that is above the overall reads as more than 100', () => {
    expect(durabilityStat(1200, 3600, 1.004)).toBe('Best 20 min held 100% after an hour')
    expect(durabilityStat(1200, 3600, 1.02)).toBe('Best 20 min held 102% after an hour')
  })

  it('names a time into an effort in the words a sentence uses', () => {
    expect(afterWords(3600)).toBe('an hour')
    expect(afterWords(7200)).toBe('2 hours')
    expect(afterWords(5400)).toBe('90 min')
    expect(afterWords(1800)).toBe('30 min')
  })

  it('is the stat the reading opens with, from the deepest level the lede quotes, with the duration it is the best at', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    // 20 min after 90 min is 94% of the 20 min best.
    expect(durability!.stat).toBe('Best 20 min held 94% after 90 min')
  })

  it('reads a run’s share in the flat speed its metabolic cost buys, as its lede does', () => {
    const { durability } = lateInEffort('run', lateEvidenceFor('run'))
    expect(durability!.stat).toMatch(/^Best 20 min held \d+% after 90 min$/)
    expect(durability!.lede).toMatch(/After 90 min your best 20 min is \d+% below/)
  })
})

describe('the finding a closed row says', () => {
  it('joins the stat and what drift did', () => {
    const reading = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(lateFinding(reading)).toBe(
      'Best 20 min held 94% after 90 min. Efficiency fell 3% from the first half to the second.',
    )
  })

  it('says one half alone when the other has too little behind it', () => {
    const drift = lateInEffort('run', { ...lateEvidenceFor('run'), drift: [] })
    expect(lateFinding(drift)).toMatch(/^Best 20 min held \d+% after 90 min\.$/)
    const durability = lateInEffort('run', { ...lateEvidenceFor('run'), durability: [] })
    expect(lateFinding(durability)).toBe('Efficiency fell 3% from the first half to the second.')
  })

  it('says a rise as a rise and a level change as level', () => {
    const rising = lateInEffort('run', {
      durability: [],
      drift: driftPoints([-2, -3, -4]),
    })
    expect(lateFinding(rising)).toBe('Efficiency rose 3% from the first half to the second.')
  })

  it('is none with neither half', () => {
    expect(lateFinding(lateInEffort('ride', NONE))).toBeNull()
  })
})

describe('the ruler under the late bests and the drift', () => {
  it('labels how near the maximum the sessions behind the late bests peaked', () => {
    const evidence = {
      ...lateEvidenceFor('run'),
      ruler: { sessions: 4, lowShare: 0.924, highShare: 0.991 },
    }
    expect(lateInEffort('run', evidence).durability!.note).toContain(
      '4 runs peaked at 92% to 99% of max heart rate.',
    )
  })

  it('says one figure where the sessions print the same, and nothing without a ruler', () => {
    const one = {
      ...lateEvidenceFor('run'),
      ruler: { sessions: 3, lowShare: 0.93, highShare: 0.931 },
    }
    expect(lateInEffort('run', one).durability!.note).toContain('3 runs peaked at 93% of max')
    const bare = { ...lateEvidenceFor('run'), ruler: null }
    expect(lateInEffort('run', bare).durability!.note).not.toContain('peaked')
  })

  it('says how hard the steady efforts were, from their average heart rate over the maximum', () => {
    const evidence = lateEvidenceFor('run')
    const shared = {
      ...evidence,
      drift: evidence.drift.map((point, i) => ({ ...point, share: 0.7 + 0.01 * (i % 5) })),
    }
    expect(lateInEffort('run', shared).drift!.note).toContain(
      'Their average heart rate was 70% to 74% of max heart rate.',
    )
    expect(lateInEffort('run', evidence).drift!.note).not.toContain('Their average heart rate')
  })

  it('never calls the maximum a reference', () => {
    const evidence = {
      ...lateEvidenceFor('run'),
      ruler: { sessions: 4, lowShare: 0.924, highShare: 0.991 },
      drift: driftPoints([1, 2, 3]).map((point) => Object.assign(point, { share: 0.7 })),
    }
    const reading = lateInEffort('run', evidence)
    expect(reading.durability!.note).not.toMatch(/reference heart rate/)
    expect(reading.drift!.note).not.toMatch(/reference heart rate/)
  })
})

describe('when the period held too little and the reading is the whole library’s', () => {
  it('says which window each half read, in the sport’s own words', () => {
    const pooled = {
      ...lateEvidenceFor('ride'),
      durabilityPooled: true as const,
      driftPooled: true as const,
    }
    const { durability, drift } = lateInEffort('ride', pooled)
    expect(durability!.note).toContain(
      'This period has too few long rides, so this uses all of yours.',
    )
    expect(drift!.note).toContain(
      'This period has too few steady rides, so this uses all of yours.',
    )
  })

  it('says nothing of a window when the period had enough', () => {
    const { durability, drift } = lateInEffort('run', lateEvidenceFor('run'))
    expect(durability!.note).not.toContain('too few')
    expect(drift!.note).not.toContain('too few')
  })

  it('says it for the half that was pooled alone', () => {
    const { durability, drift } = lateInEffort('run', {
      ...lateEvidenceFor('run'),
      driftPooled: true,
    })
    expect(durability!.note).not.toContain('too few')
    expect(drift!.note).toContain('too few steady runs')
  })
})

describe('the stat where no session was shown hard', () => {
  it('is a floor, "at least", with no ruler or none that reached a hard heart rate', () => {
    for (const ruler of [null, undefined, { sessions: 0, lowShare: 0, highShare: 0 }]) {
      const { durability } = lateInEffort('ride', { ...lateEvidenceFor('ride'), ruler })
      expect(durability!.stat).toBe('Best 20 min held at least 94% after 90 min')
    }
  })

  it('is the share itself with a session that reached a hard heart rate', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(durability!.stat).toBe('Best 20 min held 94% after 90 min')
  })

  it('says the floor on the row too, for a library of easy long runs', () => {
    const easy = { ...lateEvidenceFor('run'), ruler: null, drift: [] }
    expect(lateFinding(lateInEffort('run', easy))).toMatch(
      /^Best 20 min held at least \d+% after 90 min\.$/,
    )
  })
})

describe('the window a pooled line names', () => {
  it('says all time in the durability stat when the whole library is read, and not otherwise', () => {
    const pooled = { ...lateEvidenceFor('ride'), durabilityPooled: true as const }
    expect(lateInEffort('ride', pooled).durability!.stat).toBe(
      'Best 20 min held 94% after 90 min, all time',
    )
    expect(lateInEffort('ride', lateEvidenceFor('ride')).durability!.stat).not.toContain('all time')
  })

  it('keeps the floor and the window together', () => {
    const both = { ...lateEvidenceFor('ride'), ruler: null, durabilityPooled: true as const }
    expect(lateInEffort('ride', both).durability!.stat).toBe(
      'Best 20 min held at least 94% after 90 min, all time',
    )
  })

  it('dates the drift in its lede and its row when the whole library is read', () => {
    const pooled = { ...lateEvidenceFor('run'), driftPooled: true as const }
    const reading = lateInEffort('run', pooled)
    // driftPoints are a week apart from 6 January 2025, twelve of them.
    expect(reading.drift!.window).toBe('January 2025 to March 2025')
    expect(reading.drift!.lede).toBe(
      'On steady runs over an hour from January 2025 to March 2025, efficiency fell 3% from the first half to the second (median of 12 runs).',
    )
    expect(lateFinding(reading)).toContain(
      'Efficiency fell 3% from the first half to the second, January 2025 to March 2025.',
    )
  })

  it('names one month when the efforts share it, and no dates for the period’s own', () => {
    const one = { ...NONE, drift: driftPoints([2, 3, 4]), driftPooled: true as const }
    expect(lateInEffort('run', one).drift!.window).toBe('January 2025')
    const own = lateInEffort('run', lateEvidenceFor('run'))
    expect(own.drift!.window).toBeNull()
    expect(own.drift!.lede).not.toMatch(/ from [A-Z][a-z]+ \d{4}/)
  })
})
