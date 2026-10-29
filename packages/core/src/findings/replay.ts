import { scoreInput } from './evaluate'
import type { Rejection } from './evaluate'
import { inputAt } from './input'
import type { FindingSource } from './input'
import { REGISTRY } from './registry'
import type { Registry } from './registry'
import { signOf } from './score'
import type { Shown } from './score'
import { selectFindings } from './select'
import type { Finding, FindingInput } from './types'

/** What happened at one weekly evaluation. */
export interface MarkReport {
  asOfMs: number
  /** Ids of the findings that cleared the bar at this evaluation. */
  passed: string[]
  /** Those that also held at the evaluation before (or are in a run that did): spoken, before ranking and caps. */
  spoken: Finding[]
  /** Those of them that survive deduplication, grouping and the caps: what the athlete would be shown. */
  shown: Finding[]
  /** What did not clear the bar and why. An invalid or copy rejection is a bug in the detector. */
  rejected: { id: string; reason: Rejection }[]
}

export interface Replay {
  /** What is shown at the last mark, ranked and capped, with firstSeenMs from the replay. */
  findings: Finding[]
  marks: MarkReport[]
}

export interface ReplayOptions {
  registry?: Registry
  /** The input at a date, when the caller has it already (a harness that replays one library many times). */
  inputAt?: (asOfMs: number) => FindingInput
}

/** A finding's current run of evaluations: its sign, the mark it began at, and the last mark index it was spoken at. */
interface Run {
  sign: number
  sinceMs: number
  lastIndex: number
}

/** A run lives on through one evaluation in which the finding does not clear the bar, then ends. */
const GRACE_MARKS = 1

/**
 * Evaluates the library at each weekly mark in turn, as if the app had been opened every week, and
 * speaks a finding only when it cleared the bar at two evaluations in a row (FINDINGS.consecutiveEvaluations).
 * One evaluation in which a spoken finding misses the bar does not end its run, so a finding at the
 * edge does not come and go; two do. One already being spoken stays on a lower floor of surprise.
 * A repeat of something shown within 12 weeks ranks lower, a reversal higher; only what survived
 * deduplication, grouping and the caps counts as shown.
 *
 * Pure: the same library and marks give the same result, each mark sees only the data up to it, and
 * the marks are sorted and deduplicated first. firstSeenMs is the mark a finding was first spoken at
 * in its current run, which is the latest the athlete could have first seen it if they looked every
 * week; the ledger, which remembers what was really shown, overrides it. The replay uses one
 * `setAside` throughout (see FindingSource).
 */
export function replay(
  source: FindingSource,
  asOfMarks: readonly number[],
  options: ReplayOptions = {},
): Replay {
  const registry = options.registry ?? REGISTRY
  const inputFor = options.inputAt ?? ((asOfMs: number) => inputAt(source, asOfMs))
  const marks: MarkReport[] = []
  const shown: Shown[] = []
  let passedBefore = new Map<string, number>()
  let runs = new Map<string, Run>()
  let lastShown: Finding[] = []
  const sorted = [...new Set(asOfMarks)].sort((a, b) => a - b)
  for (const [index, asOfMs] of sorted.entries()) {
    const holding = new Map(passedBefore)
    for (const [id, run] of runs) holding.set(id, run.sign)
    const scored = scoreInput(inputFor(asOfMs), registry, { shown, holding })
    const passing = scored.filter((s) => s.rejection === null).map((s) => s.finding)
    const nextRuns = new Map<string, Run>()
    const spoken: Finding[] = []
    for (const finding of passing) {
      const sign = signOf(finding.effect)
      const run = runs.get(finding.id)
      const alive =
        run !== undefined && run.sign === sign && index - run.lastIndex <= 1 + GRACE_MARKS
      if (passedBefore.get(finding.id) !== sign && !alive) continue
      const sinceMs = alive ? run.sinceMs : asOfMs
      nextRuns.set(finding.id, { sign, sinceMs, lastIndex: index })
      spoken.push({ ...finding, firstSeenMs: sinceMs })
    }
    for (const [id, run] of runs) {
      if (!nextRuns.has(id) && index - run.lastIndex <= GRACE_MARKS) nextRuns.set(id, run)
    }
    lastShown = selectFindings(spoken)
    for (const finding of lastShown) {
      shown.push({ id: finding.id, sign: signOf(finding.effect), atMs: asOfMs })
    }
    marks.push({
      asOfMs,
      passed: passing.map((f) => f.id).sort(),
      spoken,
      shown: lastShown,
      rejected: scored
        .filter((s) => s.rejection !== null)
        .map((s) => ({ id: s.finding.id, reason: s.rejection! })),
    })
    passedBefore = new Map(passing.map((f) => [f.id, signOf(f.effect)]))
    runs = nextRuns
  }
  return { findings: lastShown, marks }
}
