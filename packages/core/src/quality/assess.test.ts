import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { assessQuality } from './assess'

function makeActivity(n: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    name: 'Test activity',
    sport: 'run',
    startMs: 0,
    n,
    speed: new Float64Array(n).fill(5),
    distance: new Float64Array(n),
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(150),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
    ...overrides,
  }
}

function withPower(n: number): Activity {
  return makeActivity(n, { hasPower: true, power: new Float64Array(n).fill(250) })
}

function span(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, k) => start + k)
}

function zeroIndices(mask: Uint8Array): number[] {
  const out: number[] = []
  mask.forEach((v, i) => {
    if (v === 0) out.push(i)
  })
  return out
}

describe('assessQuality: pauses, sprints and indoor activities', () => {
  function withPause(): Activity {
    const a = makeActivity(120)
    a.speed.fill(8, 0, 30)
    a.speed.fill(0, 30, 90)
    a.speed.fill(6, 90, 120)
    a.paused.fill(1, 30, 90)
    return a
  }

  it('a 60 s auto-pause in the middle raises no flags and keeps every motion sample', () => {
    const report = assessQuality(withPause())
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('a heart-rate NaN run entirely inside a pause raises no flag but stays invalid', () => {
    const a = withPause()
    a.heartRate.fill(NaN, 30, 90)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(30, 90))
  })

  it('paused samples do not count as moving for heart-rate dropout', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 32)
    a.paused.fill(1, 20, 26)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
  })

  it('paused samples never trigger power-dropout', () => {
    const a = withPower(120)
    a.speed.fill(0, 20, 30)
    a.power.fill(NaN, 20, 30)
    a.paused.fill(1, 20, 30)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual([])
  })

  it('a real 9 m/s speed jump with no pause is still flagged', () => {
    const a = makeActivity(120)
    a.speed.fill(3)
    a.speed[50] = 12
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'speed-spike',
        start: 47,
        end: 55,
        message: 'GPS speed jumped to an impossible value',
      },
    ])
  })

  it('a cycling sprint from 8 to 16 m/s over 6 s is not flagged', () => {
    const a = makeActivity(120, { sport: 'ride' })
    a.speed.fill(8, 0, 50)
    for (let k = 0; k < 6; k++) a.speed[50 + k] = 8 + (8 * (k + 1)) / 6
    a.speed.fill(16, 56)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('a heart-rate step on the first sample after a pause is ignored', () => {
    const a = withPause()
    a.heartRate.fill(170, 90)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
  })

  it('a heart-rate step on the fourth sample after a pause is checked', () => {
    const a = withPause()
    a.heartRate.fill(170, 93)
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.kind, f.start, f.end])).toEqual([['hr-spike', 88, 99]])
  })

  it('a ride averaging 322 W with 103 bpm for 10 minutes raises hr-implausible-for-power', () => {
    const a = makeActivity(600, {
      sport: 'ride',
      hasPower: true,
      power: new Float64Array(600).map((_, i) => (i % 2 === 0 ? 300 : 344)),
      heartRate: new Float64Array(600).fill(103),
    })
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'hr-implausible-for-power',
        start: 0,
        end: 600,
        message: 'Heart rate reads too low for the power being produced for 600 seconds',
      },
    ])
  })

  it('an indoor activity without altitude raises no flag', () => {
    const report = assessQuality(makeActivity(120, { indoor: true, hasAltitude: false }))
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })
})

describe('assessQuality: clean and degenerate activities', () => {
  it('a clean run has no flags and all-ones masks', () => {
    const report = assessQuality(makeActivity(120))
    expect(report.flags).toEqual([])
    expect(report.validMotion.length).toBe(120)
    expect(zeroIndices(report.validMotion)).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual(span(0, 120))
    expect(zeroIndices(report.validGrade)).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('a clean ride with a power meter has no flags', () => {
    const ride = withPower(600)
    ride.sport = 'ride'
    ride.speed.fill(8)
    const report = assessQuality(ride)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual([])
    expect(zeroIndices(report.validGrade)).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('an activity with n = 0 has no flags and empty masks', () => {
    const report = assessQuality(makeActivity(0))
    expect(report.flags).toEqual([])
    expect(report.validMotion.length).toBe(0)
    expect(report.validHeartRate.length).toBe(0)
  })

  it('an activity with n = 0 and no altitude has no empty missing-altitude flag', () => {
    const report = assessQuality(makeActivity(0, { hasAltitude: false }))
    expect(report.flags).toEqual([])
  })

  it('without a heart-rate sensor every validHeartRate sample is 0 and no HR flags appear', () => {
    const a = makeActivity(60, { hasHeartRate: false, heartRate: new Float64Array(60).fill(NaN) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(0, 60))
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('a one-sample activity without altitude gets a flag in the singular', () => {
    const report = assessQuality(makeActivity(1, { hasAltitude: false }))
    expect(report.flags).toEqual([
      {
        kind: 'missing-altitude',
        start: 0,
        end: 1,
        message: 'No altitude was recorded for 1 second',
      },
    ])
  })
})

describe('assessQuality: hr-dropout', () => {
  it('fires on 12 s of missing heart rate while moving', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 32)
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'hr-dropout',
        start: 20,
        end: 32,
        message: 'Heart rate was missing or too low for 12 seconds while moving',
      },
    ])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(20, 32))
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('does not fire on 9 s of missing heart rate but still masks those samples', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 29)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(20, 29))
  })

  it('does not fire when exactly half the run is moving', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 32)
    a.speed.fill(0.5, 20, 26)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(20, 32))
  })

  it('fires when just over half the run is moving', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 32)
    a.speed.fill(0.5, 20, 25)
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.start, f.end])).toEqual([[20, 32]])
  })

  it('counts heart rate below 30 bpm as a dropout', () => {
    const a = makeActivity(60, { heartRate: new Float64Array(60).fill(20) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'hr-dropout',
        start: 0,
        end: 60,
        message: 'Heart rate was missing or too low for 60 seconds while moving',
      },
    ])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(0, 60))
  })

  it('does not treat heart rate of exactly 30 bpm as a dropout', () => {
    const a = makeActivity(60, { heartRate: new Float64Array(60).fill(30) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })
})

describe('assessQuality: hr-spike', () => {
  it('fires on a reading above 230 bpm, masking 5 s either side', () => {
    const a = makeActivity(120)
    a.heartRate[50] = 240
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'hr-spike',
        start: 45,
        end: 57,
        message: 'Heart rate reading jumped to an impossible value',
      },
    ])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(45, 57))
  })

  it('does not fire at exactly 230 bpm', () => {
    const a = makeActivity(120, { heartRate: new Float64Array(120).fill(230) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('fires on a 16 bpm step between samples', () => {
    const a = makeActivity(120)
    a.heartRate[50] = 166
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.start, f.end])).toEqual([[45, 57]])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(45, 57))
  })

  it('does not fire on a 15 bpm step between samples', () => {
    const a = makeActivity(120)
    a.heartRate[50] = 165
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('clips the masked window at both ends of the activity', () => {
    const a = makeActivity(20)
    a.heartRate[0] = 240
    a.heartRate[19] = 240
    const report = assessQuality(a)
    // The two flags are 8 s apart, under the 10 s merge gap, so they become one flag.
    expect(report.flags.map((f) => [f.start, f.end])).toEqual([[0, 20]])
    expect(zeroIndices(report.validHeartRate)).toEqual([...span(0, 7), ...span(14, 20)])
  })
})

describe('assessQuality: hr-implausible-for-power', () => {
  it('fires on 103 bpm while holding 322 W', () => {
    const a = makeActivity(600, {
      hasPower: true,
      power: new Float64Array(600).fill(322),
      heartRate: new Float64Array(600).fill(103),
    })
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'hr-implausible-for-power',
        start: 0,
        end: 600,
        message: 'Heart rate reads too low for the power being produced for 600 seconds',
      },
    ])
    expect(zeroIndices(report.validHeartRate)).toEqual(span(0, 600))
  })

  it('does not fire when the mean heart rate is exactly 110 bpm', () => {
    const a = makeActivity(600, {
      hasPower: true,
      power: new Float64Array(600).fill(322),
      heartRate: new Float64Array(600).fill(110),
    })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('does not fire when the mean power is just under 200 W', () => {
    const a = makeActivity(600, {
      hasPower: true,
      power: new Float64Array(600).fill(199),
      heartRate: new Float64Array(600).fill(103),
    })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('does not run without a power meter', () => {
    const a = makeActivity(600, { heartRate: new Float64Array(600).fill(103) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })
})

describe('assessQuality: power-spike', () => {
  it('fires on 2500 W, masking 1 s either side of motion', () => {
    const a = withPower(120)
    a.power[50] = 2500
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'power-spike',
        start: 49,
        end: 52,
        message: 'Power meter reported an impossible spike',
      },
    ])
    expect(zeroIndices(report.validPower)).toEqual(span(49, 52))
    expect(zeroIndices(report.validMotion)).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('does not fire at exactly 2000 W', () => {
    const a = withPower(120)
    a.power[50] = 2000
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual([])
  })

  it('merges touching spikes into one flag', () => {
    const a = withPower(120)
    a.power[50] = 2500
    a.power[53] = 2500
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'power-spike',
        start: 49,
        end: 55,
        message: 'Power meter reported an impossible spike',
      },
    ])
    expect(zeroIndices(report.validPower)).toEqual(span(49, 55))
  })

  it('merges overlapping spikes into one flag', () => {
    const a = withPower(120)
    a.power[50] = 2500
    a.power[51] = 2500
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.start, f.end])).toEqual([[49, 53]])
  })

  it('keeps distant spikes as separate flags', () => {
    const a = withPower(120)
    a.power[20] = 2500
    a.power[60] = 2500
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.start, f.end])).toEqual([
      [19, 22],
      [59, 62],
    ])
  })
})

describe('assessQuality: flag merging by gap', () => {
  it('merges same-kind flags whose gap is under 10 s', () => {
    const a = withPower(120)
    a.power[20] = 2500
    a.power[25] = 2500
    // Flags [19, 22) and [24, 27) are 2 s apart.
    expect(assessQuality(a).flags.map((f) => [f.start, f.end])).toEqual([[19, 27]])
  })

  it('keeps same-kind flags 10 s or more apart separate', () => {
    const a = withPower(120)
    a.power[20] = 2500
    a.power[33] = 2500
    // Flags [19, 22) and [32, 35) leave a gap of exactly 10 s.
    expect(assessQuality(a).flags.map((f) => [f.start, f.end])).toEqual([
      [19, 22],
      [32, 35],
    ])
  })
})

describe('assessQuality: power-dropout', () => {
  it('fires on 5 s of missing power while moving', () => {
    const a = withPower(60)
    a.power.fill(NaN, 20, 25)
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'power-dropout',
        start: 20,
        end: 25,
        message: 'Power meter stopped reporting for 5 seconds while moving',
      },
    ])
    expect(zeroIndices(report.validPower)).toEqual(span(20, 25))
  })

  it('does not fire on 4 s of missing power', () => {
    const a = withPower(60)
    a.power.fill(NaN, 20, 24)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual([])
  })

  it('does not fire when one second of the run is not above 3 m/s', () => {
    const a = withPower(60)
    a.power.fill(NaN, 20, 25)
    a.speed.fill(3, 22, 23)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validPower)).toEqual([])
  })
})

describe('assessQuality: speed-spike', () => {
  it('fires on a run faster than 12.5 m/s', () => {
    const a = makeActivity(60, { speed: new Float64Array(60).fill(13) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'speed-spike',
        start: 0,
        end: 60,
        message: 'GPS speed jumped to an impossible value',
      },
    ])
    expect(zeroIndices(report.validMotion)).toEqual(span(0, 60))
  })

  it('does not fire at exactly 12.5 m/s on a run', () => {
    const a = makeActivity(60, { speed: new Float64Array(60).fill(12.5) })
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('uses a 30 m/s limit for rides, so 30 m/s is fine and 31 m/s fires', () => {
    const fine = makeActivity(60, { sport: 'ride', speed: new Float64Array(60).fill(30) })
    expect(assessQuality(fine).flags).toEqual([])

    const fast = makeActivity(60, { sport: 'ride', speed: new Float64Array(60).fill(31) })
    expect(assessQuality(fast).flags.map((f) => [f.start, f.end])).toEqual([[0, 60]])
  })

  it('fires on a step of more than 5 m/s between samples, masking 3 s either side', () => {
    const a = withPower(120)
    a.speed[50] = 11
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'speed-spike',
        start: 47,
        end: 55,
        message: 'GPS speed jumped to an impossible value',
      },
    ])
    expect(zeroIndices(report.validMotion)).toEqual(span(47, 55))
    expect(zeroIndices(report.validPower)).toEqual([])
  })

  it('does not fire on a step of exactly 5 m/s', () => {
    const a = makeActivity(120)
    a.speed[50] = 10
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('a NaN speed sample masks only that sample and raises no flag', () => {
    const a = makeActivity(120)
    a.speed[10] = NaN
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([10])
  })
})

describe('assessQuality: altitude-jump and missing-altitude', () => {
  it('flags a 15 m altitude step and masks the full smoothed-grade footprint', () => {
    const a = makeActivity(120)
    a.altitude[50] = 115
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'altitude-jump',
        start: 40,
        end: 62,
        message: 'Altitude changed by more than 10 m in a single second',
      },
    ])
    expect(zeroIndices(report.validMotion)).toEqual([])
    expect(zeroIndices(report.validGrade)).toEqual(span(20, 82))
  })

  it('does not fire on an altitude step of exactly 10 m', () => {
    const a = makeActivity(120)
    a.altitude[50] = 110
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('without altitude it reports one missing-altitude flag and never an altitude jump', () => {
    const a = makeActivity(120, { hasAltitude: false })
    a.altitude[50] = 115
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'missing-altitude',
        start: 0,
        end: 120,
        message: 'No altitude was recorded for 120 seconds',
      },
    ])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })
})

describe('assessQuality: merging and ordering', () => {
  it('sorts flags of different kinds by start', () => {
    const a = withPower(120)
    a.altitude[50] = 115
    a.power[50] = 2500
    const report = assessQuality(a)
    expect(report.flags).toEqual([
      {
        kind: 'altitude-jump',
        start: 40,
        end: 62,
        message: 'Altitude changed by more than 10 m in a single second',
      },
      {
        kind: 'power-spike',
        start: 49,
        end: 52,
        message: 'Power meter reported an impossible spike',
      },
    ])
  })

  it('does not merge flags of different kinds that overlap', () => {
    const a = withPower(120)
    a.altitude[50] = 115
    a.power[50] = 2500
    const report = assessQuality(a)
    expect(report.flags.map((f) => f.kind)).toEqual(['altitude-jump', 'power-spike'])
  })

  it('sorts flags with equal start by kind', () => {
    const a = withPower(120)
    a.heartRate[50] = 240
    a.power[46] = 2500
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.kind, f.start, f.end])).toEqual([
      ['hr-spike', 45, 57],
      ['power-spike', 45, 48],
    ])
  })
})
