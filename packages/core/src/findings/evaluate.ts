import { DAY_MS } from '../constants'
import { weekEndFor } from '../calendar'
import type { Sport } from '../types'
import { FINDING_SPORTS, FINDINGS } from './constants'
import { lintFinding } from './copy'
import { REGISTRY } from './registry'
import type { Registry } from './registry'
import {
  adjustedSurprise,
  barRejection,
  confidenceOf,
  continuationOf,
  fingerprintOf,
  signOf,
  surprisesOf,
} from './score'
import type { Shown, Surprises } from './score'
import { selectFindings } from './select'
import type { Candidate, Detector, Finding, FindingInput, Span } from './types'

const WEEK_MS = 7 * DAY_MS

/**
 * Why a candidate was not spoken. `invalid` and `copy` are bugs in the detector (a number out of range,
 * evidence from the future, a banned word) and fail the harness; `stale` is a candidate about a time that
 * has passed, and the rest is the bar doing its work.
 */
export type Rejection = 'invalid' | 'stale' | 'copy' | 'confidence' | 'surprise'

/** A candidate judged against the bar, whether it cleared it or not. */
export interface Scored {
  finding: Finding
  /** The surprise the bar is judged on (to start, and to go on), before any damping or lifting. */
  surprises: Surprises
  /** Why it does not clear the bar, or null when it does. */
  rejection: Rejection | null
}

/** What an evaluation knows of the evaluations before it. */
export interface Memory {
  /** Findings the athlete has been shown, so that a repeat ranks lower and a reversal higher. */
  shown?: readonly Shown[]
  /** Findings (id to sign) already being spoken, which stay on a lower floor of surprise. */
  holding?: ReadonlyMap<string, number>
}

/** `${detector}:${sports}:${subject}`, the sports sorted and joined with +. */
export function findingId(detector: string, sports: readonly Sport[], subject: string): string {
  return `${detector}:${[...sports].sort().join('+')}:${subject}`
}

const finiteSpan = (s: Span, latestMs: number) =>
  Number.isFinite(s.fromMs) && Number.isFinite(s.toMs) && s.fromMs <= s.toMs && s.toMs <= latestMs

/**
 * Whether a candidate is a sound report, whatever it says: numbers finite, intervals real, nothing
 * dated after the evaluation (its week may end after asOfMs, no later), evidence that is in the
 * library, and a sign that agrees with the effect's.
 */
function wellFormed(c: Candidate, input: FindingInput, ids: () => ReadonlySet<string>): boolean {
  const latestMs = weekEndFor({ startMs: input.asOfMs })
  const sign = c.support.sign
  const signAgrees =
    sign.kind === 'agree'
      ? sign.share >= 0.5 && sign.share <= 1
      : Number.isFinite(sign.z) && (sign.z === 0 || Math.sign(sign.z) === Math.sign(c.effect))
  return (
    c.headline.length > 0 &&
    c.sports.length > 0 &&
    Number.isFinite(c.effect) &&
    Number.isFinite(c.asOfMs) &&
    c.asOfMs <= input.asOfMs &&
    finiteSpan(c.window, latestMs) &&
    finiteSpan(c.baseline, latestMs) &&
    c.numbers.every(
      (n) =>
        Number.isFinite(n.value) &&
        (n.low === undefined || Number.isFinite(n.low)) &&
        (n.high === undefined || Number.isFinite(n.high)),
    ) &&
    c.evidence.every((ref) => ref.type !== 'activity' || ids().has(ref.id)) &&
    Number.isFinite(c.support.n) &&
    Number.isFinite(c.support.nNeeded) &&
    signAgrees
  )
}

function rejectionOf(
  c: Candidate,
  input: FindingInput,
  ids: () => ReadonlySet<string>,
  confidence: number,
  surprise: Surprises,
  holding: boolean,
): Rejection | null {
  if (!wellFormed(c, input, ids)) return 'invalid'
  if (c.asOfMs < input.asOfMs - FINDINGS.staleWeeks * WEEK_MS) return 'stale'
  if (lintFinding(c).length > 0) return 'copy'
  return barRejection(confidence, surprise, holding)
}

function scoreCandidate(
  detector: Detector,
  c: Candidate,
  input: FindingInput,
  ids: () => ReadonlySet<string>,
  memory: Memory,
): Scored {
  const id = findingId(detector.id, c.sports, c.subject)
  const sign = signOf(c.effect)
  const confidence = confidenceOf(c.support)
  const surprises = surprisesOf(c.surprise)
  const holding = memory.holding?.get(id) === sign
  const continuation = continuationOf(id, sign, input.asOfMs, memory.shown ?? [])
  const surprise = adjustedSurprise(holding ? surprises.staying : surprises.entering, continuation)
  const finding: Finding = {
    id,
    detector: detector.id,
    kind: detector.kind,
    sports: [...c.sports].sort(),
    direction: c.direction,
    effect: c.effect,
    window: c.window,
    baseline: c.baseline,
    headline: c.headline,
    numbers: c.numbers,
    evidence: c.evidence,
    method: c.method,
    confidence,
    surprise,
    score: confidence * surprise,
    likelyCause: c.likelyCause,
    corroboratedBy: [],
    asOfMs: c.asOfMs,
    firstSeenMs: input.asOfMs,
    fingerprint: fingerprintOf(id, c.effect),
  }
  return {
    finding,
    surprises,
    rejection: rejectionOf(c, input, ids, confidence, surprises, holding),
  }
}

/** Whether `a` should be kept over `b` when two candidates have one id: one that clears the bar first, then the higher score. */
function preferred(a: Scored, b: Scored): boolean {
  const aClears = a.rejection === null
  return aClears !== (b.rejection === null) ? aClears : a.finding.score > b.finding.score
}

/**
 * Every candidate the registry's detectors make as of the input, each judged against the speaking bar.
 * A detector runs for a sport only with enough history in that sport. A finding two sports' runs both
 * make is kept once: the one that clears the bar, else the higher score.
 */
export function scoreInput(
  input: FindingInput,
  registry: Registry = REGISTRY,
  memory: Memory = {},
): Scored[] {
  const byId = new Map<string, Scored>()
  let known: Set<string> | null = null
  const ids = () => (known ??= new Set(input.digests.map((d) => d.id)))
  for (const sport of FINDING_SPORTS) {
    const firstMs = input.tables.firstMs[sport]
    if (firstMs === null) continue
    const historyWeeks = (input.asOfMs - firstMs) / WEEK_MS
    for (const detector of registry[sport]) {
      if (historyWeeks < detector.minHistoryWeeks) continue
      for (const candidate of detector.run(input, sport)) {
        const scored = scoreCandidate(detector, candidate, input, ids, memory)
        const before = byId.get(scored.finding.id)
        if (before === undefined || preferred(scored, before)) byId.set(scored.finding.id, scored)
      }
    }
  }
  return [...byId.values()]
}

export interface Evaluation {
  /** What clears the bar at this one evaluation, deduplicated, ranked and capped. */
  findings: Finding[]
  /** What did not, and why; an invalid or copy rejection is a bug in the detector. */
  rejected: { id: string; reason: Rejection }[]
}

export interface EvaluateOptions extends Memory {
  registry?: Registry
}

/**
 * One evaluation: runs the detectors, drops what does not clear the bar (confidence 0.80, surprise
 * 0.40), removes duplicates, ranks and caps. It does not require the bar to hold at two evaluations in a
 * row; replay does. Deterministic and pure: the date is the input's, never the clock.
 */
export function evaluateDetailed(input: FindingInput, options: EvaluateOptions = {}): Evaluation {
  const scored = scoreInput(input, options.registry, options)
  return {
    findings: selectFindings(scored.filter((s) => s.rejection === null).map((s) => s.finding)),
    rejected: scored
      .filter((s) => s.rejection !== null)
      .map((s) => ({ id: s.finding.id, reason: s.rejection! })),
  }
}

export function evaluate(input: FindingInput, options: EvaluateOptions = {}): Finding[] {
  return evaluateDetailed(input, options).findings
}
