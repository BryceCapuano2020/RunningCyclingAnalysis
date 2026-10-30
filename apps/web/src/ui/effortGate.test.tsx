// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S, THRESHOLD_HOLD_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { EffortCheck } from '@rca/core/types'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult } from './components/fixtures'
import { heldAction, heldReason } from './components/headlineNeed'
import { headlinePick } from './components/pickHeadline'
import { effortCaveat, effortChipText } from './effortCaveat'
import { racePredictionNeed, racePredictionsOf } from './racePredictions'
import { holdOf, heldPick } from './resultHold'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { floorThreshold } from './thresholdFloor'
import { thresholdNeedsLine } from './thresholdNeeds'
import { heldBestHeading, thresholdUncheckedLine, thresholdWithheldLine } from './thresholdWithheld'

afterEach(cleanup)

const gate = (over: Partial<EffortGate> = {}): EffortGate => ({
  verdict: 'notHard',
  unchecked: null,
  share: 0.8,
  reference: 'trusted',
  referenceBpm: 190,
  referenceSource: 'data',
  referenceFrom: 'run',
  floor: { durationS: THRESHOLD_HOLD_S, value: 3.4 },
  neededS: HEADLINE_DURATION_S,
  sessions: { hard: [], endurance: [] },
  ...over,
})

const UNKNOWN = gate({
  verdict: 'unknown',
  share: null,
  floor: null,
  unchecked: 'noBest',
  reference: null,
  referenceBpm: null,
})
const NO_HEART_RATE = gate({
  verdict: 'unknown',
  share: null,
  unchecked: 'noHeartRate',
  reference: null,
})
const THIN = gate({ verdict: 'unknown', unchecked: 'thin', reference: 'thin', share: null })
const HARD = gate({ verdict: 'hard', share: 0.95 })

/** A result whose run threshold the effort gate withheld, with the best 30 minutes as its floor. */
const withheld = (over: Partial<EffortGate> = {}, refs: Partial<AnalysisResult> = {}) =>
  makeResult({
    runCp: null,
    runCpRefusal: 'effort',
    runMaxHeartRate: 186,
    effortGate: { run: gate(over), ride: UNKNOWN },
    ...refs,
  })

describe('the chip when the reference cannot show an effort was hard', () => {
  const check = (reference: EffortCheck['runReference'], share = 0.98): EffortCheck => ({
    durationS: HEADLINE_DURATION_S,
    runHrFraction: share,
    rideHrFraction: null,
    runReference: reference,
    rideReference: null,
  })

  it('says a share of a trusted reference, and no more than the share shows', () => {
    const close = effortChipText('run', check('trusted'))!
    expect(close).toMatchObject({ hard: true, label: 'Hard effort · 98%' })
    expect(close.detail).toContain(': close to your highest heart rate.')
    expect(close.detail).not.toContain('so it was hard')
    const within = effortChipText('run', check('trusted', 0.92))!
    expect(within.detail).toContain(
      ': within 10% of your highest heart rate. Heart rate cannot tell a hard 20 min from an all-out one.',
    )
  })

  it('names the maximum the athlete entered, or the age it was worked out from, as the reference', () => {
    const entered = effortChipText('run', { ...check('trusted'), runReferenceSource: 'entered' })!
    expect(entered.detail).toContain('(the max heart rate you entered)')
    expect(entered.detail).toContain('close to your max heart rate')
    const age = effortChipText('run', { ...check('trusted'), runReferenceSource: 'age' })!
    expect(age.detail).toContain('(estimated from your age)')
  })

  it('does not call a best hard, or print its share, when the reference is low or where the typical day is', () => {
    for (const reference of ['low', 'habitual'] as const) {
      const chip = effortChipText('run', check(reference))!
      expect(chip.hard).toBe(false)
      expect(chip.label).toBe('Effort not confirmed')
      expect(chip.detail).toContain('cannot show your best 20 min was hard')
      expect(chip.detail).toContain('Set your max heart rate in Profile')
      expect(chip.detail).not.toContain('98%')
      expect(chip.detail).not.toContain('A hard 20 min effort would')
    }
  })

  it('asks a reference far above the age band to be confirmed, not a harder effort', () => {
    const chip = effortChipText('run', check('high'))!
    expect(chip.label).toBe('Effort not confirmed')
    expect(chip.detail).toContain('far above the usual maximum for your age')
    expect(chip.detail).toContain('enter it as your max heart rate in Profile')
  })

  it('says the effort was not checked where too few days have a heart rate', () => {
    const chip = effortChipText('run', check('thin'))!
    expect(chip).toMatchObject({ hard: false, label: 'Effort not checked' })
    expect(chip.detail).toContain('too few days with heart rate')
    expect(effortCaveat(check('thin'))?.short).toBe(
      'Effort not checked: too few days with heart rate.',
    )
  })

  it('gives the share card a line that heart rate does not show the efforts were hard', () => {
    expect(effortCaveat(check('low'))?.short).toBe(
      'Heart rate does not show the best efforts over 20 min were hard.',
    )
    expect(effortCaveat(check('trusted'))).toBeNull()
  })
})

describe('a threshold the effort gate withheld', () => {
  it('shows the best 30 minutes as a floor in place of the estimate, named for what it is', () => {
    const floor = floorThreshold(withheld(), 'run', 70, 'metric')
    expect(floor?.value).toMatch(/\/km$/)
    expect(floorThreshold(withheld({ floor: null }), 'run', 70, 'metric')).toBeNull()
    expect(heldBestHeading(withheld(), 'run')).toBe('Best 30 min pace')
    expect(
      heldBestHeading(withheld({ floor: { durationS: HEADLINE_DURATION_S, value: 3.4 } }), 'run'),
    ).toBe('Best 20 min pace')
    expect(heldBestHeading(makeResult(), 'run')).toBeNull()
  })

  it('asks for a harder effort only when the reference can show one hard', () => {
    expect(thresholdWithheldLine(withheld(), 'run')).toBe(
      'Your best 20 min was not a hard effort: it reached 80% of your running reference heart rate. A hard 20 min effort would give a threshold.',
    )
  })

  it('asks for the reference to be set or earned when it is too low, with its bpm, or where a typical day is', () => {
    const low = thresholdWithheldLine(
      withheld({ reference: 'low', referenceBpm: 139.4, neededS: null }),
      'run',
    )!
    expect(low).toContain(
      'the highest running heart rate on file, 139 bpm, is too low to be a maximum',
    )
    expect(low).toContain(
      'Set your max heart rate in Profile, or reach hard heart rates on several days.',
    )
    expect(low).not.toContain('A hard 20 min effort would')
    const habitual = thresholdWithheldLine(
      withheld({ reference: 'habitual', neededS: null }),
      'run',
    )!
    expect(habitual).toContain(
      "your running heart rate on file never rises far above a typical day's",
    )
    expect(habitual).toContain('Set your max heart rate in Profile')
  })

  it('says a low cycling reference worked out from running is the running that is low', () => {
    const line = thresholdWithheldLine(
      {
        ...withheld(),
        runCp: null,
        rideCp: null,
        rideCpRefusal: 'effort',
        effortGate: {
          run: UNKNOWN,
          ride: gate({ reference: 'low', referenceFrom: 'run', neededS: null }),
        },
      },
      'ride',
    )!
    expect(line).toContain(
      'the highest heart rate on file for your running, which your cycling reference is worked out from, is too low',
    )
  })

  it('asks a high reference to be confirmed', () => {
    const line = thresholdWithheldLine(
      withheld({ reference: 'high', referenceBpm: 212, neededS: null }),
      'run',
    )!
    expect(line).toContain('is far above the usual maximum for your age')
    expect(line).toContain('If it is right, enter it as your max heart rate in Profile.')
  })

  it('has no line for a threshold that was refused for another reason, or that is there', () => {
    expect(thresholdWithheldLine(makeResult(), 'run')).toBeNull()
    expect(
      thresholdWithheldLine(makeResult({ runCp: null, runCpRefusal: 'shape' }), 'run'),
    ).toBeNull()
    expect(thresholdNeedsLine(withheld(), 'run')).toBe(thresholdWithheldLine(withheld(), 'run'))
  })

  it('says a shown threshold was not checked where there was no heart rate to check it by', () => {
    const noHr = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(noHr, 'run')).toBe(
      'Effort not checked: no heart rate on your best 20 min run. Add a run with heart rate to check it.',
    )
    const thin = makeResult({ effortGate: { run: THIN, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(thin, 'run')).toContain('too few days with heart rate')
    expect(thresholdUncheckedLine(makeResult(), 'run')).toBeNull()
  })

  it('is drawn on the sport page’s panel as a recorded best, with the reason and no spread or chip', () => {
    const { container } = render(
      <ThresholdPanel
        sport="run"
        result={withheld()}
        massKg={70}
        units="metric"
        rangeDays={null}
      />,
    )
    expect(screen.getByText('Best 30 min pace')).toBeInTheDocument()
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(screen.queryByText('Estimated')).toBeNull()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).toContain('A hard 20 min effort would give a threshold.')
    expect(container.querySelector('.sport-hero__number')).not.toBeNull()
  })

  it('is drawn on the tile as a recorded best, with the reason said once', () => {
    const { container } = render(
      <ThresholdTile
        sport="run"
        result={withheld()}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.stat-tile__effort')).toBeNull()
    expect(
      container.textContent?.match(/A hard 20 min effort would give a threshold/g),
    ).toHaveLength(1)
  })

  it('says a shown threshold was not checked, on the panel and the tile', () => {
    const result = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    const panel = render(
      <ThresholdPanel sport="run" result={result} massKg={70} units="metric" rangeDays={null} />,
    )
    expect(panel.container.textContent).toContain('Effort not checked: no heart rate')
    cleanup()
    const tile = render(
      <ThresholdTile
        sport="run"
        result={result}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(tile.container.textContent).toContain('Effort not checked: no heart rate')
  })
})

describe('the hold on the Balance headline', () => {
  const curve = [curvePoint(1200, 5, 'a')]
  const three = (sport: 'run' | 'ride') =>
    Array.from({ length: 3 }, (_, n) => makeActivity({ id: `${sport}-${n}`, sport }))
  const base = (run: EffortGate, ride: EffortGate) =>
    makeResult({
      activities: [...three('run'), ...three('ride')],
      runCurve: curve,
      rideCurve: curve,
      effortGate: { run, ride },
    })

  it('holds nothing when both best 20 minutes were hard, and the pick is the pick it always was', () => {
    const result = base(HARD, HARD)
    expect(holdOf(result)).toBeNull()
    expect(heldPick(result).pick).toEqual(headlinePick(result))
    expect(heldPick(result).pick).not.toBeNull()
  })

  it('holds a sport that was not a hard effort, naming it, while the pick itself stays pure', () => {
    const result = base(gate(), HARD)
    expect(headlinePick(result)).not.toBeNull()
    const hold = holdOf(result)!
    expect(hold).toMatchObject({ reason: 'effort', sports: ['run'] })
    expect(hold.text).toBe(
      'Your best 20 min run was not a hard effort: it reached 80% of your running reference heart rate.',
    )
    expect(hold.action).toBe('Add a hard 20 min run to compare them.')
    expect(heldPick(result)).toEqual({ hold, pick: null })
  })

  it('holds a sport whose effort was not checked, whether for no heart rate or too few days', () => {
    expect(holdOf(base(NO_HEART_RATE, HARD))).toMatchObject({ sports: ['run'] })
    const thin = holdOf(base(HARD, THIN))!
    expect(thin.sports).toEqual(['ride'])
    expect(thin.text).toContain('Effort not checked: too few days with heart rate.')
    expect(thin.action).toContain('Add your year of birth or max heart rate in Profile')
  })

  it('does not ask for a harder effort of a reference that cannot be trusted', () => {
    const hold = holdOf(base(gate({ reference: 'habitual', neededS: null }), HARD))!
    expect(hold.text).toContain('cannot be called hard')
    expect(hold.action).toBe(
      'Set your max heart rate in Profile, or reach hard heart rates on several days.',
    )
    expect(hold.action).not.toContain('Add a hard')
  })

  it('says what lifts it for each sport, in one sentence', () => {
    const both = base(gate(), gate())
    expect(heldReason(both, undefined)).toContain('Your best 20 min run was not a hard effort')
    expect(heldReason(both, undefined)).toContain('Your best 20 min ride was not a hard effort')
    expect(heldAction(both, undefined)).toBe(
      'Add a hard 20 min run and a hard 20 min ride to compare them.',
    )
    // A sport with no 20 minute effort at all is asked for one, beside the sport that needs a hard one.
    const mixed = { ...base(gate(), HARD), rideCurve: [], rideCp: null }
    expect(heldAction(mixed, undefined)).toBe(
      'Add a hard 20 min run and one ride of 20 min or more to compare them.',
    )
  })

  it('has a seam for a ride that works out to more than a runner can do, above the effort', () => {
    const result = base(gate(), HARD)
    const hold = holdOf(result, {
      implausibleRide: { text: 'The ride is implausible.', action: 'Check it.' },
    })!
    expect(hold).toEqual({
      reason: 'implausible-ride',
      sports: ['ride'],
      text: 'The ride is implausible.',
      action: 'Check it.',
    })
  })
})

describe('race predictions and the effort gate', () => {
  const bests = [
    { distanceM: 5000, seconds: 21 * 60 },
    { distanceM: 10000, seconds: 44 * 60 },
  ]
  const run = (
    id: string,
    maxHeartRate: number | null,
    over: Parameters<typeof makeActivity>[0] = {},
  ) =>
    makeActivity({
      id,
      sport: 'run',
      distanceM: 10_000,
      distanceBests: bests,
      maxHeartRate,
      hasHeartRate: maxHeartRate !== null,
      ...over,
    })
  const result = (activities: ReturnType<typeof run>[], over: Partial<EffortGate> = {}) =>
    makeResult({
      activities,
      runMaxHeartRate: 190,
      effortGate: { run: gate({ sessions: sessions(activities), ...over }), ride: UNKNOWN },
    })
  /** The gate's hard sessions: the runs whose peak reached 90% of 190. */
  const sessions = (activities: ReturnType<typeof run>[]) => ({
    hard: activities.filter((a) => (a.maxHeartRate ?? 0) >= 171).map((a) => a.id),
    endurance: activities.filter((a) => a.id.startsWith('long')).map((a) => a.id),
  })

  it('carries the bests of a run that reached a hard heart rate to a race', () => {
    expect(racePredictionsOf('run', result([run('hard', 180)]))?.races.length).toBeGreaterThan(0)
  })

  it('does not carry the easy pace of a run whose peak heart rate was easy, and asks for a hard run of a mile or more', () => {
    expect(racePredictionsOf('run', result([run('easy', 140)]))).toBeNull()
    expect(racePredictionNeed('run', result([run('easy', 140)]))).toBe(
      'Needs a hard run of a mile or more. None of your runs reached a hard heart rate',
    )
  })

  it('asks for the reference, not a run, where it cannot show one hard', () => {
    const need = racePredictionNeed(
      'run',
      result([run('a', 190)], {
        reference: 'habitual',
        neededS: null,
        sessions: { hard: [], endurance: [] },
      }),
    )
    expect(need).toContain('Needs a reference heart rate that can be trusted.')
    expect(need).toContain('Set your max heart rate in Profile')
  })

  it('keeps the hard run’s bests among easy ones, and a run with no heart rate', () => {
    const mixed = racePredictionsOf('run', result([run('easy', 140), run('hard', 180)]))
    const hardOnly = racePredictionsOf('run', result([run('hard', 180)]))
    // The marathon also reads weekly volume, which counts every run; the shorter races read the bests alone.
    expect(mixed?.races.slice(0, 3)).toEqual(hardOnly?.races.slice(0, 3))
    expect(mixed?.runsVdot).toBe(hardOnly?.runsVdot)
    expect(racePredictionsOf('run', result([run('bare', null)]))).not.toBeNull()
  })

  it('carries a half marathon or longer from a run of high average heart rate, and a shorter best only from a hard one', () => {
    const halfBests = [
      { distanceM: 10000, seconds: 50 * 60 },
      { distanceM: 21_097.5, seconds: 110 * 60 },
    ]
    const long = run('long-1', 150, { distanceBests: halfBests })
    const found = racePredictionsOf('run', result([long]))!
    // Only the half marathon is carried from it: the 10 km best of a run that never got hard is not.
    expect(found.races.some((race) => race.methods.some((m) => m.fromM === 21_097.5))).toBe(true)
    expect(found.races.some((race) => race.methods.some((m) => m.fromM === 10000))).toBe(false)
  })

  it('carries every run’s bests where the gate could not judge, and says nothing is withheld', () => {
    const unchecked = result([run('easy', 140)], { verdict: 'unknown', unchecked: 'noHeartRate' })
    expect(racePredictionsOf('run', unchecked)).not.toBeNull()
  })

  it('keeps the usual need where no run holds a best', () => {
    expect(racePredictionNeed('run', result([]))).toBe(
      'Needs a best of a mile or more, or runs with heart rate',
    )
  })
})
