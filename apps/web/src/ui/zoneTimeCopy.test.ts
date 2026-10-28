import { describe, expect, it } from 'vitest'
import {
  activityLede,
  leftOutNotes,
  percentText,
  periodLede,
  timeInZonesLack,
  zoneSourceNote,
  zoneTimeText,
} from './zoneTimeCopy'
import { measureTime } from './zoneTimeFixtures'

const BANNED = ['limiter', 'weak', 'strength', 'holding you back', 'ahead of', 'grade']

/** 10 hours: 60% in zones 1 and 2, 30% middle, 10% hard. */
const easyRun = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0])
const hardRun = measureTime('run', 'heartRate', [3600, 7200, 3600, 14_400, 7200])

describe('percentText', () => {
  it('rounds to a whole percent, and keeps a trace from reading as none', () => {
    expect(percentText(0.644)).toBe('64%')
    expect(percentText(0.002)).toBe('<1%')
    expect(percentText(0)).toBe('0%')
    expect(percentText(1)).toBe('100%')
  })
})

describe('zoneTimeText', () => {
  it('writes a time the way the page writes durations', () => {
    expect(zoneTimeText(5400)).toBe('1 h 30 min')
    expect(zoneTimeText(125)).toBe('2 min 5 s')
  })
})

describe('periodLede', () => {
  it('says how much of the time was easy and how much hard when there is nothing to compare', () => {
    expect(periodLede('run', [easyRun], null, null)).toBe(
      '60% of your running time by heart rate was easy (zones 1 and 2), and 10% was hard (zones 4 and up).',
    )
  })

  it('says the biggest change against the period before once a zone moved by 5 points', () => {
    const before = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0])
    const after = measureTime('run', 'heartRate', [3600, 10_800, 7200, 14_400, 0])
    expect(periodLede('run', [after], [before], 'Previous 6 weeks')).toBe(
      'Heart rate zone 4 took 40% of your running time, up from 10% in the previous 6 weeks.',
    )
  })

  it('says a fall as down', () => {
    const lede = periodLede('run', [easyRun], [hardRun], 'Previous 6 weeks')
    expect(lede).toMatch(
      /^Heart rate zone \d took \d+% of your running time, down from \d+% in the previous 6 weeks\.$/,
    )
  })

  it('falls back to easy and hard when no zone moved enough', () => {
    expect(periodLede('run', [easyRun], [easyRun], 'Previous 6 weeks')).toMatch(/was easy/)
  })

  it('does not compare with a previous period that has too little time', () => {
    const thin = measureTime('run', 'heartRate', [60, 60, 0, 0, 0], { counted: 1 })
    expect(periodLede('run', [easyRun], [thin], 'Previous 6 weeks')).toMatch(/was easy/)
  })

  it('leads with the measure that has the most time, and names a ride as riding', () => {
    const power = measureTime('ride', 'power', [3600, 3600, 3600, 3600, 3600, 3600, 3600])
    const hr = measureTime('ride', 'heartRate', [3600, 3600, 3600, 3600, 3600])
    expect(periodLede('ride', [hr, power], null, null)).toMatch(
      /^\d+% of your riding time by power was easy \(zones 1 and 2\)/,
    )
  })

  it('is null when no measure has enough time', () => {
    const thin = measureTime('run', 'heartRate', [60, 0, 0, 0, 0], { counted: 1 })
    expect(periodLede('run', [thin], null, null)).toBeNull()
  })

  it('never uses a banned word', () => {
    for (const lede of [
      periodLede('run', [easyRun], null, null),
      periodLede('run', [easyRun], [hardRun], 'Previous 6 weeks'),
    ]) {
      for (const word of BANNED) expect(lede?.toLowerCase()).not.toContain(word)
    }
  })
})

describe('activityLede', () => {
  it('says most of the activity when one zone held more than half', () => {
    const time = measureTime('run', 'heartRate', [0, 64, 30, 6, 0])
    expect(activityLede('run', 'heartRate', time)).toBe(
      'Most of this run was in heart rate zone 2 (64%).',
    )
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
      '1 of 12 runs had no heart rate zones for their date.',
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

describe('zoneSourceNote', () => {
  it('says whether the zones were estimated, entered or both', () => {
    expect(zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1])])).toMatch(/estimate/)
    expect(zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { entered: 8 })])).toBe(
      'Zones follow the settings you entered on Profile.',
    )
    expect(
      zoneSourceNote([measureTime('run', 'heartRate', [1, 1, 1, 1, 1], { entered: 3 })]),
    ).toMatch(/where you have them/)
  })
})

describe('timeInZonesLack', () => {
  it('is null when some measure has enough time', () => {
    expect(timeInZonesLack('run', [easyRun])).toBeNull()
  })

  it('says what the sport needs when there is too little', () => {
    const thin = measureTime('run', 'heartRate', [60, 0, 0, 0, 0], { counted: 1 })
    expect(timeInZonesLack('run', [thin])).toBe(
      'Time in zones: needs 3 activities with heart rate, or a threshold pace entered on Profile, and 1 hour of them.',
    )
    expect(timeInZonesLack('ride', [])).toMatch(/with heart rate or a power meter/)
  })

  it('asks for a reference when the activities have data but no zones', () => {
    const noZones = measureTime('run', 'heartRate', [0, 0, 0, 0, 0], { counted: 0, noZones: 6 })
    expect(timeInZonesLack('run', [noZones])).toMatch(/needs a max heart rate or a threshold/)
  })
})
