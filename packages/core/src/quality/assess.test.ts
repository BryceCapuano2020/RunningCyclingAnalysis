import { describe, expect, it } from 'vitest'
import { rollingMean } from '../math'
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

  it('a heart-rate step on the third sample after a pause is ignored', () => {
    const a = withPause()
    a.heartRate.fill(170, 92)
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
  })

  it('a heart-rate step on the fourth sample after a pause is checked', () => {
    const a = withPause()
    a.heartRate.fill(170, 93)
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.kind, f.start, f.end])).toEqual([['hr-spike', 88, 99]])
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
        message:
          'No altitude was recorded for 1 second, so slope-based running cost, virtual power and calibration are left out',
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

  it('fires on exactly 10 s of missing heart rate while moving', () => {
    const a = makeActivity(60)
    a.heartRate.fill(NaN, 20, 30)
    const report = assessQuality(a)
    expect(report.flags.map((f) => [f.kind, f.start, f.end])).toEqual([['hr-dropout', 20, 30]])
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

  it('counts heart rate just under 30 bpm as a dropout', () => {
    const a = makeActivity(60, { heartRate: new Float64Array(60).fill(29) })
    const report = assessQuality(a)
    expect(report.flags.map((f) => f.kind)).toEqual(['hr-dropout'])
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

/** Heart rate takes about 30 s to change, so a step in it is eased over that, as a real change is. */
const eased = (heartRate: Float64Array): Float64Array => rollingMean(heartRate, 31)

/** A 40-minute ride at 250 W whose heart rate is 150 bpm, with `edit` applied to the heart rate. */
function ridingAt(edit: (heartRate: Float64Array) => void, power = 250): Activity {
  const n = 2400
  const heartRate = new Float64Array(n).fill(150)
  edit(heartRate)
  return makeActivity(n, {
    sport: 'ride',
    hasPower: true,
    power: new Float64Array(n).fill(power),
    heartRate: eased(heartRate),
  })
}

describe('assessQuality: hr-implausible-for-power', () => {
  it('fires on a strap that drops to 75 bpm in the middle of an effort, and masks that heart rate', () => {
    const report = assessQuality(ridingAt((hr) => hr.fill(75, 1200, 1700)))
    const [flag, ...rest] = report.flags
    expect(rest).toEqual([])
    expect(flag).toMatchObject({ kind: 'hr-implausible-for-power' })
    expect(flag!.start).toBeGreaterThan(1100)
    expect(flag!.end).toBeLessThan(1800)
    // The stretch is around the dropout's middle, and its heart rate is out of the figures.
    expect(flag!.start).toBeLessThan(1450)
    expect(flag!.end).toBeGreaterThan(1450)
    expect(zeroIndices(report.validHeartRate)).toEqual(span(flag!.start, flag!.end))
  })

  it('does not fire on a fit athlete whose heart rate is 104 bpm at 207 W when that is their level', () => {
    const report = assessQuality(ridingAt((hr) => hr.fill(104), 207))
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validHeartRate)).toEqual([])
  })

  it('does not fire on an easy 112 bpm at 207 W between harder efforts at 150 bpm', () => {
    const n = 3000
    const power = new Float64Array(n).fill(207)
    power.fill(300, 1500, 2100)
    const heartRate = new Float64Array(n).fill(112)
    heartRate.fill(150, 1500, 2100)
    const report = assessQuality(
      makeActivity(n, { sport: 'ride', hasPower: true, power, heartRate: eased(heartRate) }),
    )
    expect(report.flags).toEqual([])
  })

  it.each([40, 60, 90, 105])(
    'still catches a strap that reads %i bpm for 8 minutes of a 150 bpm effort',
    (bpm) => {
      const report = assessQuality(ridingAt((hr) => hr.fill(bpm, 1000, 1480)))
      const flags = report.flags.filter((f) => f.kind === 'hr-implausible-for-power')
      expect(flags).toHaveLength(1)
      // The rolling mean reaches the strap's stretch a little before and after it.
      expect(flags[0]!.start).toBeGreaterThan(1000 - 150)
      expect(flags[0]!.end).toBeLessThan(1480 + 150)
      expect(flags[0]!.start).toBeLessThan(1240)
      expect(flags[0]!.end).toBeGreaterThan(1240)
    },
  )

  it('does not fire on hard intervals whose heart rate lags the power, nor on the easy between them', () => {
    const n = 3000
    const power = new Float64Array(n)
    const heartRate = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const hard = Math.floor(i / 300) % 2 === 1
      power[i] = hard ? 330 : 140
      heartRate[i] = hard ? 168 : 118
    }
    const report = assessQuality(
      makeActivity(n, { sport: 'ride', hasPower: true, power, heartRate: eased(heartRate) }),
    )
    expect(report.flags).toEqual([])
  })

  it('does not fire on a stretch shorter than the rolling mean can show', () => {
    expect(assessQuality(ridingAt((hr) => hr.fill(60, 1000, 1080))).flags).toEqual([])
  })

  it('does not fire on a warm-up, when heart rate has not settled', () => {
    expect(assessQuality(ridingAt((hr) => hr.fill(90, 0, 590))).flags).toEqual([])
  })

  it('does not fire where power is low, as in a recovery', () => {
    const n = 2400
    const power = new Float64Array(n).fill(250)
    power.fill(100, 1200, 1700)
    const heartRate = new Float64Array(n).fill(150)
    heartRate.fill(95, 1200, 1700)
    const report = assessQuality(
      makeActivity(n, { sport: 'ride', hasPower: true, power, heartRate: eased(heartRate) }),
    )
    expect(report.flags).toEqual([])
  })

  it('does not judge an activity too short to show its own working level', () => {
    const a = makeActivity(1200, {
      hasPower: true,
      power: new Float64Array(1200).fill(250),
      heartRate: new Float64Array(1200).fill(60),
    })
    expect(assessQuality(a).flags).toEqual([])
  })

  it('leaves an activity read low from start to end to the library, which judges it against the athlete', () => {
    expect(assessQuality(ridingAt((hr) => hr.fill(103), 322)).flags).toEqual([])
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
  /** 60 samples at a steady speed with one sample set to `peak`: no step is above 5 m/s and no window is sustained. */
  const withPeak = (sport: 'run' | 'ride', base: number, peak: number) => {
    const speed = new Float64Array(60).fill(base)
    speed[30] = peak
    return makeActivity(60, { sport, speed })
  }

  it('fires on a run sample faster than 12.5 m/s', () => {
    const report = assessQuality(withPeak('run', 8, 13))
    expect(report.flags).toEqual([
      {
        kind: 'speed-spike',
        start: 27,
        end: 34,
        message: 'GPS speed jumped to an impossible value',
      },
    ])
    expect(zeroIndices(report.validMotion)).toEqual(span(27, 34))
  })

  it('does not fire at exactly 12.5 m/s on a run', () => {
    const report = assessQuality(withPeak('run', 8, 12.5))
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validMotion)).toEqual([])
  })

  it('uses a 30 m/s limit for rides, so 30 m/s is fine and 31 m/s fires', () => {
    expect(assessQuality(withPeak('ride', 26, 30)).flags).toEqual([])

    const fast = assessQuality(withPeak('ride', 26, 31)).flags
    expect(fast.map((f) => [f.kind, f.start, f.end])).toEqual([['speed-spike', 27, 34]])
  })

  it('flags a sustained speed no one holds once, with a spike inside it counted in the stretch', () => {
    const speed = new Float64Array(400).fill(3)
    speed.fill(9, 100, 300)
    speed[200] = 14
    const report = assessQuality(makeActivity(400, { speed }))
    expect(report.flags.map((f) => f.kind)).toEqual(['implausible-speed'])
    expect(report.flags[0]!.message).toMatch(
      /^Speed stayed beyond what anyone can sustain for \d+ seconds$/,
    )
    // The spike is masked all the same.
    const stretch = report.flags[0]!
    for (let i = stretch.start; i < stretch.end; i++) expect(report.validMotion[i]).toBe(0)
    expect(report.validMotion[197]).toBe(0)
    expect(report.validMotion[203]).toBe(0)
  })

  it('flags a spike just outside a sustained stretch as its own, though its margin reaches the stretch', () => {
    const fast = new Float64Array(400).fill(3)
    fast.fill(9, 200, 380)
    const stretchStart = assessQuality(makeActivity(400, { speed: fast })).flags.find(
      (f) => f.kind === 'implausible-speed',
    )!.start
    const at = stretchStart - 2
    const speed = Float64Array.from(fast)
    speed[at] = 14
    const flags = assessQuality(makeActivity(400, { speed })).flags
    const stretch = flags.find((f) => f.kind === 'implausible-speed')!
    // The spike sample is outside the stretch, though the three seconds either side of it are not.
    expect(at).toBeLessThan(stretch.start)
    expect(flags.some((f) => f.kind === 'speed-spike' && f.start <= at && at < f.end)).toBe(true)
  })

  it('still flags a spike that is not inside a sustained stretch', () => {
    const speed = new Float64Array(400).fill(3)
    speed[50] = 14
    speed.fill(9, 200, 380)
    const kinds = assessQuality(makeActivity(400, { speed })).flags.map((f) => f.kind)
    expect(kinds.sort()).toEqual(['implausible-speed', 'speed-spike'])
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

  it('keeps the altitude of samples valid when only their grade is masked by a step', () => {
    const a = makeActivity(120)
    a.altitude[50] = 115
    const report = assessQuality(a)
    // The grade mask covers the whole smoothing footprint; the altitude mask covers only the flag.
    expect(zeroIndices(report.validAltitude)).toEqual(span(40, 62))
    expect(zeroIndices(report.validGrade)).toEqual(span(20, 82))
  })

  it('marks a sample with no recorded altitude as not valid altitude', () => {
    const a = makeActivity(120)
    a.altitude[10] = NaN
    const report = assessQuality(a)
    expect(report.validAltitude[10]).toBe(0)
    expect(report.validAltitude[11]).toBe(1)
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
        message:
          'No altitude was recorded for 120 seconds, so slope-based running cost, virtual power and calibration are left out',
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

describe('assessQuality: altitude steps near pauses', () => {
  /** A 3.5 m/s run of 200 s with a 60 s pause from 100 s to 160 s, altitude held in the pause. */
  function pausedRun(): Activity {
    const a = makeActivity(200)
    a.speed.fill(3.5)
    a.speed.fill(0, 100, 160)
    a.paused.fill(1, 100, 160)
    return a
  }

  it.each([160, 161, 162])(
    'flags an altitude step at sample %i, within 3 samples after a pause, and masks its grade',
    (step) => {
      const a = pausedRun()
      a.altitude.fill(180, step)
      const report = assessQuality(a)
      expect(report.flags.map((f) => f.kind)).toEqual(['altitude-jump'])
      expect(report.flags[0]!.start).toBe(step - 10)
      expect(zeroIndices(report.validGrade)).toEqual(span(step - 30, step + 31))
    },
  )

  it('does not flag an altitude step on a paused sample itself', () => {
    const a = pausedRun()
    a.altitude[120] = 180
    const report = assessQuality(a)
    expect(report.flags).toEqual([])
    expect(zeroIndices(report.validGrade)).toEqual([])
  })
})

describe('assessQuality: missing altitude', () => {
  it('outdoors, makes every grade sample invalid, including paused ones', () => {
    const report = assessQuality(makeActivity(120, { hasAltitude: false }))
    expect(zeroIndices(report.validGrade)).toEqual(span(0, 120))
  })

  it('indoors, leaves grade valid because the grade is defined as zero there', () => {
    const report = assessQuality(makeActivity(120, { hasAltitude: false, indoor: true }))
    expect(zeroIndices(report.validGrade)).toEqual([])
  })
})

describe('assessQuality: hr-implausible-for-power on a very long file', () => {
  /** A 12 h ride at 220 W whose heart rate is 140 bpm, with `edit` applied to the heart rate. */
  function longRide(edit: (heartRate: Float64Array) => void): Activity {
    const n = 12 * 3600
    const heartRate = new Float64Array(n).fill(140)
    edit(heartRate)
    return makeActivity(n, {
      sport: 'ride',
      hasPower: true,
      power: new Float64Array(n).fill(220),
      heartRate: eased(heartRate),
    })
  }
  const flags = (a: Activity) =>
    assessQuality(a).flags.filter((f) => f.kind === 'hr-implausible-for-power')

  it('does not let one low probe make a run, where the probes are spaced wider than 30 s', () => {
    // A 200 s fault: at about 105 s between probes, one or two of them read low.
    expect(flags(longRide((hr) => hr.fill(35, 20_000, 20_200)))).toEqual([])
  })

  it('still flags an hour of it', () => {
    const found = flags(longRide((hr) => hr.fill(35, 20_000, 23_600)))
    expect(found).toHaveLength(1)
    expect(found[0]!.end - found[0]!.start).toBeGreaterThan(3000)
  })
})
