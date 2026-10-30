import { fitnessFindingHeadline, oneSided, shownChange } from '../../fitness/copy'
import { fitnessStatuses } from '../../fitness/compute'
import { weekOfMs } from '../../fitness/machine'
import { FITNESS } from '../../fitness/params'
import type { FitnessStatus } from '../../fitness/types'
import type { Sport } from '../../types'
import { FINDING_SPORTS, FINDINGS } from '../constants'
import type { Candidate, Detector, FindingInput, Ref } from '../types'

const F = FITNESS.finding

/** What each sport's output is measured in, for the numbers of a finding. */
const OUTPUT_UNIT: Record<Sport, string> = { run: 'm/s', ride: 'W' }
const EXCLUSIONS: Record<Sport, string[]> = {
  run: [
    'indoor runs',
    'runs at walking pace',
    'runs with heart rate set aside',
    'runs that vary in pace',
  ],
  ride: ['rides without a power meter', 'rides with heart rate set aside'],
}

/**
 * The spread each state's statistic is judged against. A slip or a rise is a z-score, usual spread 1. A back
 * is spoken exactly when its own test passes (the level's lower bound at 1.28 standard errors clears the
 * tolerance), so its statistic, which is at least 1.28 when shown, is given the spread at which that clears
 * the engine's bar of 2.5 spreads.
 */
const SPREAD: Record<string, number> = {
  slipping: F.quietSpread,
  recovering: F.quietSpread,
  back: FITNESS.episode.boundZ / FINDINGS.minSurpriseZ,
}

/** The states that are findings. Holding, holding below and not enough evidence are status lines, never findings. */
const SPOKEN = new Set(['slipping', 'recovering', 'back'])

const percent = (r: { value: number; low: number; high: number }) => ({
  value: r.value * 100,
  low: r.low * 100,
  high: r.high * 100,
})

function candidateOf(status: FitnessStatus, sport: Sport, asOfMs: number): Candidate | null {
  const { entered, evidence, change, gain } = status
  if (!SPOKEN.has(status.state) || entered === null || evidence === null || change === null) {
    return null
  }
  if (weekOfMs(asOfMs) - weekOfMs(entered.atMs) >= FITNESS.display.freshWeeks) return null
  const slipping = status.state === 'slipping'
  const shift = slipping ? change : gain
  if (shift === null || !Number.isFinite(entered.z)) return null
  // A finding states a direction, so its whole range has to lie on that side of level.
  if (!oneSided(shift) || (slipping ? !(shift.value < 0) : !(shift.value > 0))) return null
  const window = { fromMs: evidence.recent.fromMs, toMs: evidence.recent.toMs }
  const baseline = evidence.baseline ?? window
  const newest = evidence.recent.ids.slice(-F.evidenceRuns)
  const refs: Ref[] = [
    { type: 'span', span: window },
    { type: 'span', span: { fromMs: baseline.fromMs, toMs: baseline.toMs } },
    ...newest.map((id): Ref => ({ type: 'activity', id })),
  ]
  const zero = Array.from({ length: FINDINGS.noiseWeeks }, () => 0)
  return {
    subject: status.state,
    sports: [sport],
    direction: slipping ? 'worse' : 'better',
    effect: shift.value,
    window,
    baseline: { fromMs: baseline.fromMs, toMs: baseline.toMs },
    headline: fitnessFindingHeadline(status),
    numbers: [
      { key: 'now', value: status.now!, unit: OUTPUT_UNIT[sport] },
      { key: 'before', value: status.before!, unit: OUTPUT_UNIT[sport] },
      // Said as the page shows it: a run's change in pace, a ride's in power. `effect` stays in output for the engine.
      { key: 'change', unit: '%', ...percent(shownChange(sport, shift)) },
    ],
    evidence: refs,
    support: {
      sign: { kind: 'z', z: entered.z },
      n: evidence.recent.runs,
      nNeeded: FITNESS.episode.minRuns,
      robust: true,
    },
    surprise: { effect: entered.z, noise: zero, past: zero, minSd: SPREAD[status.state]! },
    method: {
      test: 'window contrast of steady runs',
      n: evidence.recent.runs + (evidence.baseline?.runs ?? 0),
      exclusions: EXCLUSIONS[sport],
    },
    asOfMs: evidence.recent.toMs,
  }
}

/**
 * Fitness at the same effort. The status of the whole library is worked out once (`fitnessStatuses`,
 * a replay of the weekly monitor to this date, remembered for these digests); this speaks only when a
 * slipping, recovering or back began in the last six weeks, so the ledger shows each once. The
 * monitor's own test (z of 3.3 held two weeks, tuned to a quarter of an alarm a year) is the evidence of
 * surprise, passed to the engine as that statistic against its usual spread in a quiet athlete.
 */
export const fitnessStatusDetector: Detector = {
  id: 'fitness-status',
  kind: 'efficiency',
  sports: FINDING_SPORTS,
  minHistoryWeeks: F.minHistoryWeeks,
  run(input: FindingInput, sport: Sport): Candidate[] {
    const status = fitnessStatuses(input.digests, input.setAside, { asOfMs: input.asOfMs })[sport]
    const candidate = candidateOf(status, sport, input.asOfMs)
    return candidate === null ? [] : [candidate]
  },
}
