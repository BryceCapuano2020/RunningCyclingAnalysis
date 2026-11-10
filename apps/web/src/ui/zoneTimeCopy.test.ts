import { describe, expect, it } from 'vitest'
import {
  THRESHOLD_NEEDS,
  ZONE_WINDOW_VALUE,
  describable,
  mainZoneRow,
  percentText,
  timeInZonesLack,
  zoneNoteLine,
  zonesChangedRows,
  zonesLinkText,
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

describe('zoneNoteLine', () => {
  it('has nothing to say when every activity counted', () => {
    const row = measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1])
    expect(zoneNoteLine('ride', [row], null)).toBeNull()
  })

  it('says how many activities each measure that left some out counted, on one line', () => {
    const hr = measureTime('ride', 'heartRate', [1, 1, 1, 1, 1], { counted: 60, setAside: 2 })
    const power = measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1], { counted: 9, noData: 53 })
    expect(zoneNoteLine('ride', [hr, power], null)).toBe(
      'Heart rate from 60 of 62 · measured power from 9 of 62 rides',
    )
  })

  it('counts a missing zone set among what a measure left out, and groups thousands', () => {
    const pace = measureTime('run', 'pace', [1, 1, 1, 1, 1], { counted: 1200, noZones: 34 })
    expect(zoneNoteLine('run', [pace], null)).toBe('Pace from 1,200 of 1,234 runs')
  })

  it('leads with the stretch the bars are of', () => {
    const hr = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { counted: 8, noData: 1 })
    expect(zoneNoteLine('run', [hr], null, 'year')).toBe(
      'Last 12 months · Heart rate from 8 of 9 runs',
    )
    expect(zoneNoteLine('run', [easyRun], null, 'all')).toBe('All time')
  })

  it('never says Details or an em dash', () => {
    const hr = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { counted: 8, noData: 1 })
    expect(zoneNoteLine('run', [hr], null, 'year')).not.toMatch(/Details|\u2014/)
  })
})

describe('zonesChangedRows', () => {
  const now = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { enteredReferences: [180] })

  it('names a measure whose zones changed since the period before', () => {
    const before = measureTime('run', 'heartRate', [3600, 3600, 3600, 3600, 3600], {
      enteredReferences: [200],
    })
    expect(zonesChangedRows([now], [before])).toEqual(['Heart rate zones changed, not compared'])
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

describe('zonesLinkText', () => {
  it('asks to set the zones while they are estimated, and to edit them once set', () => {
    const text = (entered?: number) =>
      zonesLinkText([
        measureTime('run', 'heartRate', [1, 1, 1, 1, 1], entered === undefined ? {} : { entered }),
      ])
    expect(text()).toBe('Set your zones on Profile')
    expect(text(8)).toBe('Edit your zones on Profile')
    expect(text(3)).toBe('Edit your zones on Profile')
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
