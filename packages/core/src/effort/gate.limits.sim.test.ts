// The effort gate on synthetic libraries: what it cannot do, recorded (harness: test/gateSim.ts).
import { describe, expect, it } from 'vitest'
import type { Draw } from './test/arms'
import { REAL_EASY, allowLongArms, count, draws, recordArms, train } from './test/gateSim'

allowLongArms()

describe('what the gate cannot do, recorded', () => {
  it('holds tempo riding with a power meter only by the fit’s own refusal, and without one like a runner', () => {
    // With a meter the typical day at the maximum does not hold the reference (the judged best is a measurement); without one
    // the watts are an estimate and the reference reads as a runner's does.
    const meter = count('tempo riding with a meter', train('tempo', {}, {}, 'ride'), 'hard')
    const none = count(
      'tempo riding without a meter',
      train('tempo', {}, { withPower: false }, 'ride'),
      'hard',
    )
    const readings = (name: string) =>
      draws(name, train('tempo', {}, {}, 'ride')).filter(
        (d) => d.result.effortGate.ride.reference === 'habitual',
      ).length
    expect(readings('tempo riding with a meter')).toBe(0)
    expect(meter.n).toBeGreaterThan(none.n)
    expect(none.high).toBeLessThan(0.1)
    // The fit of a tempo-only ride is refused for its shape either way.
    expect(
      draws('tempo riding with a meter', train('tempo', {}, {}, 'ride')).every(
        (d) => d.result.rideCp === null,
      ),
    ).toBe(true)
  })

  it('does not see through tempo and intervals every week: 96 pass with a fit about 13% under the truth', () => {
    const arm = train('mixed')
    const { low } = count('mixed', arm, 'hard')
    expect(low).toBeGreaterThan(0.85)
    const errors = draws('mixed', arm)
      .flatMap((d) => (d.error === null ? [] : [d.error]))
      .sort((a, b) => a - b)
    expect(errors[errors.length >> 1]!).toBeLessThan(-0.1)
  })

  it('holds weekly tempo with easy days between in about a third of athletes, and the fit is refused for shape', () => {
    const arm = train('tempoEasy')
    const { n } = count('tempoEasy', arm, 'hard')
    expect(n).toBeGreaterThan(55)
    expect(n).toBeLessThan(85)
    expect(draws('tempoEasy', arm).every((d) => d.result.runCp === null)).toBe(true)
  })

  it('cannot judge a single test day, or two weeks, without the age: nothing is withheld and the screens say so', () => {
    for (const [name, arm] of [
      ['one test day', train('testOnly')],
      ['two weeks of hard training', train('hard', {}, { weeks: 2 })],
    ] as const) {
      const found = draws(name, arm)
      expect(
        found.every((d) => d.result.effortGate.run.verdict === 'unknown'),
        name,
      ).toBe(true)
      expect(
        found.every((d) => d.result.effortGate.run.unchecked === 'thin'),
        name,
      ).toBe(true)
      expect(
        found.every((d) => d.result.runCp !== null || d.result.runCpRefusal !== 'effort'),
        name,
      ).toBe(true)
    }
  })

  it('lets some realistic easy runners through when their days differ by a heart-rate offset', () => {
    // A hot day or a poor night lifts the whole day's heart rate by several beats, so the days of an easy library spread and
    // its typical day sits further under the maximum. About one in eight read as trusted, and the best 20 minutes then reads hard.
    const { n, high } = count(
      'easy with an offset',
      train('easy', {}, { ...REAL_EASY, dayOffsetBpm: 6 }),
      'hard',
    )
    expect(n).toBeGreaterThan(0)
    expect(high).toBeLessThan(0.25)
  })

  it('judges a test day against the age-predicted maximum when the age is known: about two in three pass', () => {
    const { n } = count('one test day, age known', train('testOnly', { age: 'known' }), 'hard')
    expect(n).toBeGreaterThan(55)
    expect(n).toBeLessThan(82)
  })

  it('holds athletes whose maximum is under 150 bpm when the age is not given, and fewer when it is', () => {
    const lowMax = { athlete: { hrMax: [140, 165] as const } }
    const noAge = count('low maximum', train('hard', lowMax), 'hard')
    const age = count('low maximum, age known', train('hard', { ...lowMax, age: 'known' }), 'hard')
    // Recorded: 54 and 72 of 100 pass. The rest read `low`; entering the maximum passes them.
    expect(noAge.n).toBeLessThan(age.n)
    expect(noAge.high).toBeLessThan(0.65)
  })

  it('reads a beginner whose heart rate at critical power is 80% to 88% of maximum as not hard: a limit of the heart-rate line', () => {
    // Recorded: 19 of 100 pass. The line is 90% of the reference; in this model a beginner's all-out 20 minutes sits under it.
    const { n } = count('beginners', train('hard', { athlete: { atCp: [0.8, 0.88] } }), 'hard')
    expect(n).toBeLessThan(35)
  })

  it('holds about one athlete in six who raced three times on easy running: the reference rule needs three days to agree', () => {
    // Easy running with a race every fourth week is three race days (weeks 4, 8 and 12). The reference (referenceMax.ts) takes
    // the highest value three days reached within 3 bpm of each other among the top days; three races rarely agree that
    // closely, so for 17 athletes in 100 the first three days that do are easy ones and the reference reads the easy level, low.
    // By maximum heart rate the held and the passed are alike (mean 183 and 181 bpm; the held range from 168 up), so it is not the
    // maximum: it is the agreement rule, which is the reference's (C1) and not the gate's. The race days' heart rate is not set aside.
    const found = draws('races', train('raceMix'))
    const held = found.filter((d) => d.result.effortGate.run.verdict === 'notHard')
    const passed = found.filter((d) => d.result.effortGate.run.verdict === 'hard')
    expect(held.length).toBeGreaterThan(8)
    expect(held.length).toBeLessThan(30)
    expect(held.every((d) => d.result.effortGate.run.reference === 'low')).toBe(true)
    expect(found.every((d) => d.result.heartRateSetAside.length === 0)).toBe(true)
    const mean = (list: Draw[]) => list.reduce((s, d) => s + d.athlete.hrMax, 0) / list.length
    expect(Math.abs(mean(held) - mean(passed))).toBeLessThan(8)
  })
})

recordArms()
