import type { SameHeartRateBySport } from '../digest/sameHeartRateTypes'
import type { DriftPoint } from '../digest/driftTrend'
import type { PeriodDurabilityRow } from '../digest/durabilityPeriod'
import type { ActivityDigest, Sport } from '../types'
import type { UnitSystem } from '../units'

/** What a finding is about, which also decides how many may share the top of a list. */
export type Kind = 'efficiency' | 'pattern' | 'discipline' | 'durability'

/** `better` and `worse` are about the athlete's output; `neutral` is a change with no side (a habit). Wording is neutral for all. */
export type Direction = 'better' | 'worse' | 'neutral'

/**
 * A detector's name, such as 'same-hr-run'. A plain string so that adding a detector does not edit this
 * file; the registry rejects two detectors with one id.
 */
export type DetectorId = string

/** A stretch of time, UTC epoch milliseconds, from the start of the first day to the end of the last. */
export interface Span {
  fromMs: number
  toMs: number
}

/** What a finding points at: one activity, one week (by its Sunday end, as a trend's), or a stretch. */
export type Ref =
  { type: 'activity'; id: string } | { type: 'week'; endMs: number } | { type: 'span'; span: Span }

/** One figure of a finding, in its own unit, with the ends of its interval when it has one. */
export interface NumberFact {
  key: string
  value: number
  unit: string
  low?: number
  high?: number
}

/** How the finding was reached, for the evidence panel's method line. */
export interface Method {
  /** The test, such as 'cluster bootstrap' or 'rank test'. */
  test: string
  /** Activities (or weeks) the test saw. */
  n: number
  /** What was left out, such as 'indoor runs' or 'activities with heart rate set aside'. */
  exclusions: string[]
}

/** A pre-registered explanation, shown as "Likely explanation, not proof" and never stated as a cause. */
export interface LikelyCause {
  text: string
  /** The detectors or tables whose findings it rests on. */
  signals: string[]
}

/**
 * Evidence for the sign of an effect. A bootstrap gives the share of draws on the effect's side
 * (`agree`, 0.5 to 1); a comparison of two fits or two means gives z.
 */
export type SignEvidence =
  | { kind: 'agree'; share: number }
  /** z carries the sign of the candidate's `effect`. Give `degrees` (fitDifference does) when few activities stand behind it. */
  | { kind: 'z'; z: number; degrees?: number }

/** What a detector gives to confidence: c = signConfidence x sufficiency x robustness (see score.ts). */
export interface Support {
  sign: SignEvidence
  /** Activities the estimate stands on, and how many it needs to be fully supported. */
  n: number
  nNeeded: number
  /** Whether the sign survives leaving out any one activity. */
  robust: boolean
  /** The most confidence this detector may reach, when its method is weaker than the others'. */
  cap?: number
}

/**
 * What surprise is judged against, all in one unit: that of the series the comparison is made on, which
 * need not be that of the candidate's `effect` (a ratio compared on a log scale, say). `effect` is the
 * comparison now; `noise` is the same comparison made at each of the previous 26 weeks, which says what
 * is usual (its median) and how far it wanders (its spread); `past` is every earlier one, so rarity is
 * the share of the athlete's own past that strayed less from usual. A steady ramp therefore scores near
 * nothing: its effect is what it has always been. Build all three with surpriseInputOf from the weekly
 * series when the comparison is between two points of it.
 */
export interface SurpriseInput {
  effect: number
  noise: number[]
  past: number[]
  /** The smallest spread that counts as noise, in the unit of effect, for a series that is nearly constant. */
  minSd?: number
}

/** What a detector reports before it is scored. Detectors know nothing of ranking, bars or ledgers. */
export interface Candidate {
  /**
   * Tells apart the findings one detector makes in one sport, such as 'same-hr' or 'easy-runs'. Becomes the
   * id's last part, so it must name what the finding is about and nothing that changes as the library
   * grows: not the reference heart rate (it moves with the athlete's newest year), not a date, not a
   * count. The id is what the ledger, the damping and the dismissals follow.
   */
  subject: string
  sports: Sport[]
  direction: Direction
  /**
   * Signed effect: a relative change as a fraction (0.05 is 5%) wherever the quantity has a scale of
   * its own, and in the quantity's unit (bpm) where it has none. The sign, the fingerprint and the
   * test for a material change read it; surprise does not (see SurpriseInput).
   */
  effect: number
  /** The recent stretch compared, and the stretch it is compared with. */
  window: Span
  baseline: Span
  /** Written with copy.ts from the numbers; findings with banned words are dropped. */
  headline: string
  numbers: NumberFact[]
  evidence: Ref[]
  support: Support
  /** Null when the history is too short to judge, and the finding cannot be spoken. */
  surprise: SurpriseInput | null
  method: Method
  /** The date of the newest activity the finding rests on. Never the clock. */
  asOfMs: number
  likelyCause?: LikelyCause
}

/** A finding as the app shows it. */
export interface Finding {
  /** `${detector}:${sports}:${subject}`, stable while the finding stays the same finding. */
  id: string
  detector: DetectorId
  kind: Kind
  sports: Sport[]
  direction: Direction
  effect: number
  window: Span
  baseline: Span
  headline: string
  numbers: NumberFact[]
  evidence: Ref[]
  method: Method
  /** 0 to 1: how sure of the sign. */
  confidence: number
  /** 0 to 1: how little the athlete's own history made it likely, damped when it was shown before. */
  surprise: number
  /** confidence x surprise, which ranks. */
  score: number
  likelyCause?: LikelyCause
  /** Ids of same-sport efficiency findings that say the same thing in another way. */
  corroboratedBy: string[]
  /** The date of the newest evidence. */
  asOfMs: number
  /**
   * The first weekly evaluation at which it was spoken in its current run, as a replay works it out.
   * That is an upper bound on when the athlete first saw it: the ledger, which remembers what was
   * actually shown, overrides it.
   */
  firstSeenMs: number
  /** Detector, sign and rounded effect: it changes when the finding has moved enough to show again. */
  fingerprint: string
}

/** Seconds of a week's moving time. Weeks are as the trend's: ending Sunday 23:59:59.999 UTC. */
export interface WeekSeconds {
  endMs: number
  seconds: number
  activities: number
  /** False for the week that asOfMs falls in before its Sunday: its seconds are part of a week, so leave it out of comparisons. */
  complete: boolean
}

/** How many of a week's activities carry each source, for telling a change in the athlete from one in the recording. */
export interface WeekCoverage {
  endMs: number
  activities: number
  withHeartRate: number
  withMeasuredPower: number
  complete: boolean
}

export type SourceKind = 'heartRate' | 'power'

/** A step in the share of activities that have a source: from the week at `atMs` on, `after` of them do, against `before`. */
export interface SourceChange {
  source: SourceKind
  /** The end of the first week after the step. */
  atMs: number
  before: number
  after: number
}

/** Per-activity time in the zone groups: easy is zones 1 and 2, middle zone 3, hard zone 4 and up. */
export interface ZoneActivity {
  id: string
  sport: Sport
  startMs: number
  movingS: number
  easyS: number
  middleS: number
  hardS: number
  /** The heart rate the zones were set from when this activity was made, so a moved reference can be told. */
  zoneReferenceBpm: number
}

/** A week's seconds in each zone group. */
export interface ZoneWeek {
  endMs: number
  easyS: number
  middleS: number
  hardS: number
}

/**
 * Time in zones, filled once zones are in the library. Optional input: detectors that need it return
 * nothing without it.
 */
export interface ZoneTables {
  activities: ZoneActivity[]
  weeks: Record<Sport, ZoneWeek[]>
}

/** Everything computed once for the whole library, whatever period is picked, and read by every detector. */
export interface SharedTables {
  /** Library-wide: the reference heart rate and the newest 52 weeks of each sport. */
  sameHeartRate: SameHeartRateBySport
  /**
   * Every week from the sport's first activity to asOfMs, quiet weeks as zero. The last may be
   * incomplete (see `complete`).
   */
  weeklyMoving: Record<Sport, WeekSeconds[]>
  /** The same weeks, with the activities that have heart rate and measured power. */
  coverage: Record<Sport, WeekCoverage[]>
  /**
   * Where the share of activities with heart rate, or with measured power, stepped by 30 points or more
   * (at most one step for each source). A recorded step is a change in how activities were recorded,
   * not necessarily in the athlete: a finding that rests on the source stays silent, or loses its
   * explanation, around it. A new strap or meter that leaves the share alone is not visible here.
   */
  sourceChanges: Record<Sport, SourceChange[]>
  /** Each sport's steady-effort drift points, earliest first, heart rate not set aside. */
  drift: Record<Sport, DriftPoint[]>
  /**
   * Each sport's best output fresh and after 1, 1.5 and 2 hours, over all time: a best never fades, so a
   * detector that compares periods (late-output retention) works out its own bests inside each window.
   */
  durability: Record<Sport, PeriodDurabilityRow[]>
  /** The start of each sport's first activity, or null. */
  firstMs: Record<Sport, number | null>
}

/** What a detector reads. Digests are of the current model, in canonical order, none after asOfMs. */
export interface FindingInput {
  digests: ActivityDigest[]
  /**
   * Activities whose heart rate is not trusted. A replay applies one set at every mark, so it has to be
   * the set as it stood at that mark for the replay to be honest: an activity set aside later is set
   * aside earlier than it was.
   */
  setAside: ReadonlySet<string>
  /** The week-end mark being evaluated, taken from the data. */
  asOfMs: number
  tables: SharedTables
  zones?: ZoneTables
}

/** A detector: pure, deterministic, reading digests and tables only. */
export interface Detector {
  id: DetectorId
  kind: Kind
  sports: readonly Sport[]
  /** Weeks of a sport's history it needs before it is run for that sport. */
  minHistoryWeeks: number
  run: (input: FindingInput, sport: Sport) => Candidate[]
}

/** How a sport's output is read, said and compared. One entry per sport, so no code branches on the sport. */
export interface SportAdapter {
  sport: Sport
  /** "run" and "ride", for headlines. */
  noun: string
  nounPlural: string
  /** What the sport's output is called: "pace" or "power". */
  outputName: string
  /** Whether the activity's output can be trusted, as sameHeartRate reads it: outdoor runs, measured power. */
  usable: (digest: ActivityDigest) => boolean
  /** The distribution holding the sport's output in a digest. */
  outputDistribution: 'speed' | 'power'
  /** A raw output (m/s, W) as the sport writes it: "5:52 /km", "212 W". */
  format: (output: number, system: UnitSystem) => string
  /** How far apart two raw outputs are, as "18 s/km" or "9 W" with the word for the side: "faster", "more". A higher output is the better one in both sports. */
  difference: (from: number, to: number, system: UnitSystem) => { amount: string; word: string }
  /** The relative change in output at the same heart rate that is worth saying. */
  minRelativeChange: number
}
