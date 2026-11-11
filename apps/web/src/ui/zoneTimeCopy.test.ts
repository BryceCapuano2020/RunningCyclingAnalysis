import { describe, expect, it } from 'vitest'
import {
  THRESHOLD_NEEDS,
  ZONE_WINDOW_VALUE,
  describable,
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

describe('zoneNoteLine', () => {
  it('has nothing to say over the period, however many activities each measure counted', () => {
    const hr = measureTime('ride', 'heartRate', [1, 1, 1, 1, 1], { counted: 60, setAside: 2 })
    const power = measureTime('ride', 'power', [1, 1, 1, 1, 1, 1, 1], { counted: 9, noData: 53 })
    expect(zoneNoteLine([hr, power], null)).toBeNull()
  })

  it('names the stretch the bars are of when it is wider than the period', () => {
    expect(zoneNoteLine([easyRun], null, 'year')).toBe('Last 12 months')
    expect(zoneNoteLine([easyRun], null, 'all')).toBe('All time')
  })

  it('never says Details or an em dash', () => {
    expect(zoneNoteLine([easyRun], null, 'year')).not.toMatch(/Details|\u2014/)
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
