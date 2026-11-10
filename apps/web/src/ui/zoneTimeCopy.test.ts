import { describe, expect, it } from 'vitest'
import {
  THRESHOLD_NEEDS,
  ZONE_WINDOW_VALUE,
  describable,
  leftOutRows,
  mainZoneRow,
  percentText,
  timeInZonesLack,
  zoneSourceRow,
  zonesChangedRows,
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
    expect(ZONE_WINDOW_VALUE).toEqual({ year: 'Last 12 months', all: 'All time' })
  })
})

describe('mainZoneRow', () => {
  it('gives the zone that held the most time, with its share', () => {
    const time = measureTime('run', 'heartRate', [0, 64, 30, 6, 0])
    expect(mainZoneRow('heartRate', time)).toEqual({
      label: 'Most time',
      value: 'Heart rate zone 2, 64%',
    })
  })

  it('reads a share that rounds to all of it as above 99%, and a spread share as it is', () => {
    expect(mainZoneRow('pace', measureTime('run', 'pace', [0, 100, 0, 0, 0]))?.value).toBe(
      'Pace zone 2, 100%',
    )
    expect(mainZoneRow('pace', measureTime('run', 'pace', [0, 99.6, 0.4, 0, 0]))?.value).toBe(
      'Pace zone 2, >99%',
    )
    expect(
      mainZoneRow('power', measureTime('ride', 'power', [0, 10, 38, 30, 22, 0, 0]))?.value,
    ).toBe('Measured power zone 3, 38%')
  })

  it('has nothing to say without time', () => {
    expect(mainZoneRow('pace', measureTime('run', 'pace', [0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe('leftOutRows', () => {
  it('counts the activities a measure left out as a row each, with what mends the missing zones', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], {
      counted: 9,
      noData: 2,
      noZones: 1,
    })
    expect(leftOutRows('run', [row])).toEqual([
      { label: 'Heart rate, no reading', value: '2 of 12 runs' },
      { label: 'Heart rate, no zones', value: '1 of 12 runs' },
      {
        label: 'Heart rate zones need',
        value: 'Enter your max heart rate on Profile to get them.',
      },
    ])
  })

  it('groups the thousands of a long history, as the count above it does', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { counted: 1200, noData: 34 })
    expect(leftOutRows('run', [row])).toEqual([
      { label: 'Heart rate, no reading', value: '34 of 1,234 runs' },
    ])
  })

  it('says what gives a pace zones when a date has none', () => {
    const pace = measureTime('run', 'pace', [1, 1, 1, 1, 1], { counted: 5, noZones: 2 })
    expect(leftOutRows('run', [pace]).map((row) => row.value)).toEqual([
      '2 of 7 runs',
      'A run of 8 min or more sets your pace zones.',
    ])
  })

  it('counts a heart rate set aside apart from one that was not recorded', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], {
      counted: 8,
      noData: 1,
      setAside: 2,
    })
    expect(leftOutRows('run', [row])).toEqual([
      { label: 'Heart rate, set aside', value: '2 of 11 runs' },
      { label: 'Heart rate, no reading', value: '1 of 11 runs' },
    ])
  })

  it('has nothing to say when every activity counted', () => {
    expect(leftOutRows('ride', [measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1])])).toEqual([])
  })

  it('names measured power for a ride without a power meter', () => {
    const row = measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1], { counted: 4, noData: 6 })
    expect(leftOutRows('ride', [row])).toEqual([
      { label: 'Measured power, no reading', value: '6 of 10 rides' },
    ])
  })
})

describe('zonesChangedRows', () => {
  const now = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { enteredReferences: [180] })

  it('names a measure whose zones changed since the period before', () => {
    const before = measureTime('run', 'heartRate', [3600, 3600, 3600, 3600, 3600], {
      enteredReferences: [200],
    })
    expect(zonesChangedRows([now], [before])).toEqual([
      { label: 'Heart rate zones', value: 'Changed, not compared' },
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
    expect(zonesChangedRows([now], [same])).toEqual([])
    expect(zonesChangedRows([now], [thin])).toEqual([])
    expect(zonesChangedRows([now], null)).toEqual([])
  })
})

describe('zoneSourceRow', () => {
  it('says whether the zones were estimated, entered or both', () => {
    const value = (entered?: number) =>
      zoneSourceRow([
        measureTime('run', 'heartRate', [1, 1, 1, 1, 1], entered === undefined ? {} : { entered }),
      ]).value
    expect(value()).toBe('Estimated, set yours on Profile')
    expect(value(8)).toBe('Set on Profile')
    expect(value(3)).toBe('Set on Profile where you have them, estimated elsewhere')
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
