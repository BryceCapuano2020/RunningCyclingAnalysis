import { describe, expect, it } from 'vitest'
import { DRIFT, DURABILITY_AFTER_S, LATE_IN_EFFORT } from '@rca/core/constants'
import {
  DECOUPLING_REFERENCE,
  afterWords,
  driftChange,
  durabilityStat,
  lateFinding,
  driftFinding,
  driftLede,
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
    expect(DECOUPLING_REFERENCE).toBe('A fall of 5%')
  })
})

describe('the fade', () => {
  it('is the whole percent a late best is below the best overall, negative when it is above', () => {
    expect(fadePercent(0.94)).toBe(6)
    expect(fadePercent(0.9449)).toBe(6)
    expect(fadePercent(0.996)).toBe(0)
    expect(fadePercent(1.03)).toBe(-3)
  })
})

describe('a sport’s late bests', () => {
  it('quote the deepest level that has enough activities, at its longest duration', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    // 120 min has 2 activities at 5 min and none at 20 min; 90 min has 4 at 20 min and 5 at 5 min.
    expect(durability!.stat).toBe('94% of your best 20 min after 90 min')
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
    expect(lateInEffort('ride', evidence).durability!.stat).toBe(
      // No ruler in this evidence, so the share is a floor.
      'at least 90% of your best 5 min after 2 hours',
    )
  })
})

describe('the drift lede', () => {
  it('says the median fall from the first half to the second', () => {
    expect(driftLede(3.2)).toBe('Efficiency fell 3% from the first half to the second.')
    expect(driftLede(6.4)).toBe('Efficiency fell 6% from the first half to the second.')
  })

  it('says a rise as a rise and a change under 1% as level', () => {
    expect(driftChange(-2.4)).toBe('rose 2%')
    expect(driftChange(0.4)).toBe('held level')
    expect(driftChange(-0.4)).toBe('held level')
    expect(driftChange(0.5)).toBe('fell 1%')
    expect(driftLede(-2.4)).toBe('Efficiency rose 2% from the first half to the second.')
    expect(driftLede(0.2)).toBe('Efficiency held level from the first half to the second.')
  })

  it('takes the median of the efforts, the mean of the middle two for an even count', () => {
    expect(medianOf([5, 1, 3])).toBe(3)
    expect(medianOf([1, 2, 3, 10])).toBe(2.5)
    const { drift } = lateInEffort('run', {
      durability: [],
      drift: driftPoints([1, 2, 3, 3, 4, 2, 5, 3, 6, 3, 4, 2]),
    })
    expect(drift!.lede).toBe('Efficiency fell 3% from the first half to the second.')
    expect(drift!.medianPct).toBe(3)
  })

  it('shows from 3 steady efforts and not from 2', () => {
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3, 4]) }).drift).not.toBeNull()
    expect(lateInEffort('run', { ...NONE, drift: driftPoints([2, 3]) }).drift).toBeNull()
  })
})

describe('what the row says of heart rate drift', () => {
  it('says the efficiency change in whole percent, and level within 1% either way', () => {
    expect(driftFinding(3.2)).toBe('efficiency fell 3%')
    expect(driftFinding(-2.6)).toBe('efficiency rose 3%')
    expect(driftFinding(0.4)).toBe('level')
    expect(driftFinding(-0.4)).toBe('level')
    expect(driftFinding(0.5)).toBe('efficiency fell 1%')
  })

  it('says all time when the whole library is read', () => {
    expect(driftFinding(3.2, true)).toBe('efficiency fell 3%, all time')
    expect(driftFinding(0.2, true)).toBe('level, all time')
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
    ].flatMap((r) => [r.durability?.stat, r.drift?.lede, lateFinding(r)].concat(r.needs))
    for (const text of texts.filter((t): t is string => t !== undefined && t !== null)) {
      expect(text).not.toMatch(/limiter|weak|strength|holding you back|ahead of/i)
    }
  })
})

describe('the durability stat', () => {
  it('says the share of the best held after a time, in whole percent', () => {
    expect(durabilityStat(1200, 3600, 0.99)).toBe('99% of your best 20 min after an hour')
    expect(durabilityStat(300, 5400, 0.941)).toBe('94% of your best 5 min after 90 min')
    expect(durabilityStat(1200, 7200, 0.8149)).toBe('81% of your best 20 min after 2 hours')
  })

  it('rounds the share and not the fall, so a best that is above the overall reads as more than 100', () => {
    expect(durabilityStat(1200, 3600, 1.004)).toBe('100% of your best 20 min after an hour')
    expect(durabilityStat(1200, 3600, 1.02)).toBe('102% of your best 20 min after an hour')
  })

  it('names a time into an effort in the words a sentence uses', () => {
    expect(afterWords(3600)).toBe('an hour')
    expect(afterWords(7200)).toBe('2 hours')
    expect(afterWords(5400)).toBe('90 min')
    expect(afterWords(1800)).toBe('30 min')
  })

  it('is the stat the reading opens with, from the deepest level it quotes, with the duration it is the best at', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    // 20 min after 90 min is 94% of the 20 min best.
    expect(durability!.stat).toBe('94% of your best 20 min after 90 min')
  })

  it('reads a run’s share in the flat speed its metabolic cost buys', () => {
    const { durability } = lateInEffort('run', lateEvidenceFor('run'))
    expect(durability!.stat).toMatch(/^\d+% of your best 20 min after 90 min$/)
  })
})

describe('the finding a closed row says', () => {
  it('names each half and joins them', () => {
    const reading = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(lateFinding(reading)).toBe(
      'Durability: 94% of your best 20 min after 90 min. Heart rate drift: efficiency fell 3%.',
    )
  })

  it('says one half alone when the other has too little behind it', () => {
    const drift = lateInEffort('run', { ...lateEvidenceFor('run'), drift: [] })
    expect(lateFinding(drift)).toMatch(/^Durability: \d+% of your best 20 min after 90 min\.$/)
    const durability = lateInEffort('run', { ...lateEvidenceFor('run'), durability: [] })
    expect(lateFinding(durability)).toBe('Heart rate drift: efficiency fell 3%.')
  })

  it('says a rise as a rise and a level change as level', () => {
    const rising = lateInEffort('run', { durability: [], drift: driftPoints([-2, -3, -4]) })
    expect(lateFinding(rising)).toBe('Heart rate drift: efficiency rose 3%.')
    const level = lateInEffort('run', { durability: [], drift: driftPoints([0.2, -0.3, 0.1]) })
    expect(lateFinding(level)).toBe('Heart rate drift: level.')
  })

  it('is none with neither half', () => {
    expect(lateFinding(lateInEffort('ride', NONE))).toBeNull()
  })
})

describe('when the period held too little and the reading is the whole library’s', () => {
  it('says all time on each half that was pooled, and on neither otherwise', () => {
    const pooled = {
      ...lateEvidenceFor('ride'),
      durabilityPooled: true as const,
      driftPooled: true as const,
    }
    const { durability, drift } = lateInEffort('ride', pooled)
    expect(durability!.stat).toBe('94% of your best 20 min after 90 min, all time')
    expect(drift!.lede).toBe('Efficiency fell 3% from the first half to the second, all time.')
    const own = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(own.durability!.stat).not.toContain('all time')
    expect(own.drift!.lede).not.toContain('all time')
  })

  it('says it for the half that was pooled alone', () => {
    const reading = lateInEffort('run', { ...lateEvidenceFor('run'), driftPooled: true })
    expect(reading.durability!.stat).not.toContain('all time')
    expect(lateFinding(reading)).toMatch(/Heart rate drift: efficiency fell 3%, all time\.$/)
    expect(lateFinding(reading)).not.toMatch(/after 90 min, all time/)
  })
})

describe('the stat where no session was shown hard', () => {
  it('is a floor, "at least", with no ruler or none that reached a hard heart rate', () => {
    for (const ruler of [null, undefined, { sessions: 0, lowShare: 0, highShare: 0 }]) {
      const { durability } = lateInEffort('ride', { ...lateEvidenceFor('ride'), ruler })
      expect(durability!.stat).toBe('at least 94% of your best 20 min after 90 min')
    }
  })

  it('is the share itself with a session that reached a hard heart rate', () => {
    const { durability } = lateInEffort('ride', lateEvidenceFor('ride'))
    expect(durability!.stat).toBe('94% of your best 20 min after 90 min')
  })

  it('says the floor on the row too, for a library of easy long runs', () => {
    const easy = { ...lateEvidenceFor('run'), ruler: null, drift: [] }
    expect(lateFinding(lateInEffort('run', easy))).toMatch(
      /^Durability: at least \d+% of your best 20 min after 90 min\.$/,
    )
  })
})

describe('the stat where the floor and the window meet', () => {
  it('keeps the floor and all time together', () => {
    const both = { ...lateEvidenceFor('ride'), ruler: null, durabilityPooled: true as const }
    expect(lateInEffort('ride', both).durability!.stat).toBe(
      'at least 94% of your best 20 min after 90 min, all time',
    )
  })
})
