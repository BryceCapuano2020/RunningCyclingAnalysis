import { describe, expect, it } from 'vitest'
import {
  THRESHOLD_NEEDS,
  ZONE_WINDOW_LINE,
  activityLede,
  describable,
  leftOutNotes,
  percentText,
  timeInZonesLack,
  zoneSourceNote,
  zonesChangedNotes,
  zoneTimeText,
} from './zoneTimeCopy'
import { measureTime } from './test/zoneTimeFixtures'

const BANNED = ['limiter', 'weak', 'strength', 'holding you back', 'ahead of', 'grade']

/** 10 hours: 60% in zones 1 and 2, 30% middle, 10% hard. */
const easyRun = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0])

describe('percentText', () => {
  it('rounds to a whole percent, and keeps a trace from reading as none', () => {
    expect(percentText(0.644)).toBe('64%')
    expect(percentText(0.002)).toBe('<1%')
    expect(percentText(0)).toBe('0%')
    expect(percentText(0.996)).toBe('>99%')
    expect(percentText(1)).toBe('100%')
    expect(percentText(1)).toBe('100%')
  })
})

describe('zoneTimeText', () => {
  it('writes a time the way the page writes durations', () => {
    expect(zoneTimeText(5400)).toBe('1 h 30 min')
    expect(zoneTimeText(125)).toBe('2 min 5 s')
  })
})

describe('describable', () => {
  const thin = measureTime('run', 'heartRate', [60, 60, 0, 0, 0], { counted: 1 })
  const pace = measureTime('run', 'pace', [3600, 7200, 7200, 3600, 0])

  it('keeps the measures with 3 activities and an hour, most time first', () => {
    expect(describable([thin, pace, easyRun])).toEqual([easyRun, pace])
  })

  it('describes whatever there is over all time, the last window there is', () => {
    expect(describable([thin])).toEqual([])
    expect(describable([thin], true)).toEqual([thin])
    expect(
      describable([measureTime('run', 'pace', [0, 0, 0, 0, 0], { counted: 0 })], true),
    ).toEqual([])
  })

  it('names the stretch a wider window is of in a few words', () => {
    expect(ZONE_WINDOW_LINE).toEqual({ year: 'Last 12 months.', all: 'All time.' })
  })
})

describe('activityLede', () => {
  it('says most of the activity when one zone held more than half', () => {
    const time = measureTime('run', 'heartRate', [0, 64, 30, 6, 0])
    expect(activityLede('run', 'heartRate', time)).toBe(
      'Most of this run was in heart rate zone 2 (64%).',
    )
  })

  it('says all of the activity when one zone shows 100%', () => {
    const time = measureTime('run', 'pace', [0, 100, 0, 0, 0])
    expect(activityLede('run', 'pace', time)).toBe('All of this run was in pace zone 2 (100%).')
  })

  it('says most, not all, of an activity that rounds to 100% but is not all in one zone', () => {
    const time = measureTime('run', 'pace', [0, 99.6, 0.4, 0, 0])
    expect(activityLede('run', 'pace', time)).toBe('Most of this run was in pace zone 2 (>99%).')
  })

  it('says where the most time was when no zone held half', () => {
    const time = measureTime('ride', 'power', [0, 10, 38, 30, 22, 0, 0])
    expect(activityLede('ride', 'power', time)).toBe(
      'This ride spent the most time in power zone 3 (38%).',
    )
  })

  it('has nothing to say without time', () => {
    expect(activityLede('run', 'pace', measureTime('run', 'pace', [0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe('leftOutNotes', () => {
  it('counts the activities a measure left out and says why', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], {
      counted: 9,
      noData: 2,
      noZones: 1,
    })
    expect(leftOutNotes('run', [row])).toEqual([
      '2 of 12 runs had no heart rate to count.',
      '1 of 12 runs had no heart rate zones for their date. Enter your max heart rate on Profile to get them.',
    ])
  })

  it('groups the thousands of a long history, as the count above it does', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { counted: 1200, noData: 34 })
    expect(leftOutNotes('run', [row])).toEqual(['34 of 1,234 runs had no heart rate to count.'])
  })

  it('says what gives a pace or a power zones when a date has none', () => {
    const pace = measureTime('run', 'pace', [1, 1, 1, 1, 1], { counted: 5, noZones: 2 })
    expect(leftOutNotes('run', [pace])).toEqual([
      '2 of 7 runs had no pace zones for their date. A run of 20 min or more sets your pace zones.',
    ])
  })

  it('counts a heart rate set aside apart from one that was not recorded', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], {
      counted: 8,
      noData: 1,
      setAside: 2,
    })
    expect(leftOutNotes('run', [row])).toEqual([
      '2 of 11 runs had heart rate set aside.',
      '1 of 11 runs had no heart rate to count.',
    ])
  })

  it('has nothing to say when every activity counted', () => {
    expect(leftOutNotes('ride', [measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1])])).toEqual([])
  })

  it('names measured power for a ride without a power meter', () => {
    const row = measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1], { counted: 4, noData: 6 })
    expect(leftOutNotes('ride', [row])).toEqual(['6 of 10 rides had no measured power to count.'])
  })
})

describe('zonesChangedNotes', () => {
  const now = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { enteredReferences: [180] })

  it('names a measure whose zones changed since the period before', () => {
    const before = measureTime('run', 'heartRate', [3600, 3600, 3600, 3600, 3600], {
      enteredReferences: [200],
    })
    expect(zonesChangedNotes([now], [before])).toEqual([
      'Heart rate zones changed since the previous period, so the two are not compared.',
    ])
  })

  it('says nothing when the zones match, or the period before has too little to compare', () => {
    const same = measureTime('run', 'heartRate', [3600, 3600, 3600, 3600, 3600], {
      enteredReferences: [180],
    })
    const thin = measureTime('run', 'heartRate', [60, 0, 0, 0, 0], {
      counted: 1,
      enteredReferences: [200],
    })
    expect(zonesChangedNotes([now], [same])).toEqual([])
    expect(zonesChangedNotes([now], [thin])).toEqual([])
    expect(zonesChangedNotes([now], null)).toEqual([])
  })
})

describe('zoneSourceNote', () => {
  it('says whether the zones were estimated, entered or both', () => {
    expect(zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1])])).toBe(
      'Zones estimated. Set your own on Profile.',
    )
    expect(zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { entered: 8 })])).toBe(
      'Zones set on Profile.',
    )
    expect(zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { entered: 3 })])).toBe(
      'Zones set on Profile where you have them, estimated elsewhere.',
    )
  })
})

describe('the words a need says', () => {
  it('never uses a banned word', () => {
    for (const note of Object.values(THRESHOLD_NEEDS)) {
      for (const word of BANNED) expect(note.toLowerCase()).not.toContain(word)
    }
  })
})

describe('timeInZonesLack', () => {
  it('is null when some measure has enough time', () => {
    expect(timeInZonesLack('run', [easyRun])).toBeNull()
  })

  it('says what the sport needs when there is too little', () => {
    const thin = measureTime('run', 'heartRate', [60, 0, 0, 0, 0], { counted: 1 })
    expect(timeInZonesLack('run', [thin])).toBe(
      'Needs an activity with heart rate, or a threshold pace entered on Profile.',
    )
    expect(timeInZonesLack('ride', [])).toBe('Needs an activity with heart rate or a power meter.')
    // Over all time, the widest window there is, whatever the library holds is described.
    expect(timeInZonesLack('run', [thin], true)).toBeNull()
  })

  it('asks for a reference when the activities have data but no zones', () => {
    const noZones = measureTime('run', 'heartRate', [0, 0, 0, 0, 0], { counted: 0, noZones: 6 })
    expect(timeInZonesLack('run', [noZones])).toBe(
      'Needs a max heart rate or a threshold, entered on Profile.',
    )
  })
})
