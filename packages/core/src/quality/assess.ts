import { CLIMB_RATE_WINDOW_S, MAX_CLIMB_RATE_MS } from '../constants'
import { rollingMean } from '../math'
import type { AgreedStreams } from './agreement'
import { agreedStreams } from './agreement'
import { HR_IMPLAUSIBLE_FOR_POWER, implausiblyLowHeartRate } from './lowHeartRate'
import type { Range } from './runs'
import { runsWhere } from './runs'
import { implausibleSpeedStretches } from './sustainedSpeed'
import { GRADE_SMOOTHING_MARGIN_S } from '../metabolic'
import { SPORT_TRACE } from '../workbench/sportTrace'
import type { Activity, QualityFlag, QualityKind, QualityReport } from '../types'

/** Every threshold used by assessQuality. Samples are 1 Hz, so samples and seconds are the same. */
export const QUALITY_THRESHOLDS = {
  /** Heart rate below this, or NaN, counts as a dropout. */
  minValidBpm: 30,
  hrDropout: { minDurationS: 10, movingSpeedMs: 0.5, movingFraction: 0.5 },
  hrSpike: { maxBpm: 230, maxStepBpm: 15, marginS: 5 },
  hrImplausibleForPower: HR_IMPLAUSIBLE_FOR_POWER,
  powerSpike: { maxW: 2000, marginS: 1 },
  powerDropout: { minDurationS: 5, minSpeedMs: 3 },
  speedSpike: {
    /** The same ceiling the file readers drop fixes above (SPORT_TRACE), so there is one number a sport. */
    maxSpeedMs: { run: SPORT_TRACE.run.maxSpeedMs, ride: SPORT_TRACE.ride.maxSpeedMs },
    maxStepMs: 5,
    marginS: 3,
  },
  altitudeJump: { maxStepM: 10, marginS: 10 },
  /**
   * A rise of at least maxMs over windowS, in altitude smoothed over smoothS to quiet sample noise,
   * is an altitude error. The light smoothing keeps a minute at maxMs flagged for most of it.
   */
  implausibleClimb: { maxMs: MAX_CLIMB_RATE_MS, windowS: CLIMB_RATE_WINDOW_S, smoothS: 10 },
  /** smoothGrade spreads an altitude error across its rolling mean and grade difference. */
  gradeContaminationMarginS: GRADE_SMOOTHING_MARGIN_S,
  /** Same-kind flags closer than this, in seconds, are one flag, so noisy sensors do not multiply flags. */
  flagMergeGapS: 10,
} as const

interface RawFlag extends Range {
  kind: QualityKind
}

function count(r: Range, pred: (i: number) => boolean): number {
  let k = 0
  for (let i = r.start; i < r.end; i++) if (pred(i)) k++
  return k
}

function every(r: Range, pred: (i: number) => boolean): boolean {
  for (let i = r.start; i < r.end; i++) if (!pred(i)) return false
  return true
}

/** The sample at i plus `margin` samples either side, clipped to [0, n). */
function around(i: number, margin: number, n: number): Range {
  return { start: Math.max(0, i - margin), end: Math.min(n, i + margin + 1) }
}

function markRange(raw: RawFlag[], mask: Uint8Array, kind: QualityKind, r: Range): void {
  mask.fill(0, r.start, r.end)
  raw.push({ kind, start: r.start, end: r.end })
}

/**
 * 1 where a sample-to-sample step may be checked. Pauses produce artificial steps at both edges
 * (speed drops to 0 and back), and sensors settle for a few seconds after a pause ends. Sample i
 * is excluded when i or i-1 is paused, or when it is one of the 3 samples after a pause ends.
 */
function steadyMask(paused: Uint8Array, n: number): Uint8Array {
  const steady = new Uint8Array(n).fill(1)
  for (let j = 0; j < n; j++) {
    if (paused[j] === 1) steady.fill(0, j, Math.min(n, j + 4))
  }
  return steady
}

function heartRateRules(
  a: Activity,
  validHr: Uint8Array,
  raw: RawFlag[],
  steady: Uint8Array,
): void {
  const { n, speed, heartRate, paused } = a
  const t = QUALITY_THRESHOLDS

  const dropped = (i: number): boolean => {
    const hr = heartRate[i]!
    return Number.isNaN(hr) || hr < t.minValidBpm
  }
  const moving = (i: number): boolean => paused[i] !== 1 && speed[i]! > t.hrDropout.movingSpeedMs
  for (const run of runsWhere(n, dropped)) {
    validHr.fill(0, run.start, run.end)
    const len = run.end - run.start
    if (len < t.hrDropout.minDurationS) continue
    if (count(run, moving) > len * t.hrDropout.movingFraction) {
      raw.push({ kind: 'hr-dropout', start: run.start, end: run.end })
    }
  }

  for (let i = 0; i < n; i++) {
    const hr = heartRate[i]!
    const jumped =
      i > 0 && steady[i] === 1 && Math.abs(hr - heartRate[i - 1]!) > t.hrSpike.maxStepBpm
    if (hr > t.hrSpike.maxBpm || jumped) {
      markRange(raw, validHr, 'hr-spike', around(i, t.hrSpike.marginS, n))
    }
  }

  if (a.hasPower) {
    for (const run of implausiblyLowHeartRate(a, t.minValidBpm)) {
      markRange(raw, validHr, 'hr-implausible-for-power', run)
    }
  }
}

function powerRules(a: Activity, validPower: Uint8Array, raw: RawFlag[]): void {
  if (!a.hasPower) return
  const { n, speed, power } = a
  const t = QUALITY_THRESHOLDS

  for (let i = 0; i < n; i++) {
    if (power[i]! > t.powerSpike.maxW) {
      markRange(raw, validPower, 'power-spike', around(i, t.powerSpike.marginS, n))
    }
  }

  const missing = (i: number): boolean => Number.isNaN(power[i]!) && a.paused[i] !== 1
  const fast = (i: number): boolean => speed[i]! > t.powerDropout.minSpeedMs
  for (const run of runsWhere(n, missing)) {
    if (run.end - run.start < t.powerDropout.minDurationS) continue
    if (every(run, fast)) markRange(raw, validPower, 'power-dropout', run)
  }
}

function motionRules(
  a: Activity,
  validMotion: Uint8Array,
  validGrade: Uint8Array,
  validAltitude: Uint8Array,
  raw: RawFlag[],
  steady: Uint8Array,
): void {
  const { n, speed, altitude, paused } = a
  const t = QUALITY_THRESHOLDS
  const maxSpeed = t.speedSpike.maxSpeedMs[a.sport]

  // A speed no single sample gives away, held for a window longer than anyone could hold it. A burst
  // like that is one event: where a single-sample spike falls inside it, the stretch is the flag and
  // the spike is only masked, so the burst is not counted twice.
  const sustained = implausibleSpeedStretches(a)
  const insideStretch = (i: number): boolean => sustained.some((s) => s.start <= i && i < s.end)
  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const jumped = i > 0 && steady[i] === 1 && Math.abs(v - speed[i - 1]!) > t.speedSpike.maxStepMs
    if (v > maxSpeed || jumped) {
      const range = around(i, t.speedSpike.marginS, n)
      if (insideStretch(i)) validMotion.fill(0, range.start, range.end)
      else markRange(raw, validMotion, 'speed-spike', range)
    }
  }
  for (const stretch of sustained) markRange(raw, validMotion, 'implausible-speed', stretch)

  if (!a.hasAltitude) {
    // Outdoors, grade is unknown, so nothing grade-dependent may be used. Indoors, grade is zero.
    if (a.indoor) return
    validGrade.fill(0)
    if (n > 0) raw.push({ kind: 'missing-altitude', start: 0, end: n })
    return
  }
  // No steady gate here: a step right after a pause is still a discontinuity in the grade. Only the
  // paused samples themselves are skipped, since their altitude is not being recorded.
  const steps = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const jump = Math.abs(altitude[i]! - altitude[i - 1]!) > t.altitudeJump.maxStepM
    if (paused[i] !== 1 && jump) {
      steps[i] = altitude[i]! - altitude[i - 1]!
      const flagRange = around(i, t.altitudeJump.marginS, n)
      raw.push({ kind: 'altitude-jump', ...flagRange })
      validAltitude.fill(0, flagRange.start, flagRange.end)
      validGrade.fill(
        0,
        Math.max(0, i - t.gradeContaminationMarginS),
        Math.min(n, i + t.gradeContaminationMarginS + 1),
      )
    }
  }
  // Indoors the grade is zero whatever the altitude says, so a climb there is left alone.
  if (!a.indoor) climbRule(a, steps, validGrade, validAltitude, raw)
}

/**
 * Flags each stretch where smoothed altitude rises faster than anyone climbs, a ramp too gradual
 * for the single-second jump rule. The steps the jump rule flagged (`steps`, the change at each) are
 * taken out first, so a lone jump is reported once, as a jump, while a ramp around a jump is still
 * a ramp. The flag covers the seconds at the centre of a too-fast window; the altitude is left out
 * over those windows and the smoothing, and the grade with the margin a grade spreads over. Only
 * rises are flagged: a fall too fast lowers a run's cost and a ride's power, so it cannot make a
 * best, and a fast descent on a bike is real.
 */
function climbRule(
  a: Activity,
  steps: Float64Array,
  validGrade: Uint8Array,
  validAltitude: Uint8Array,
  raw: RawFlag[],
): void {
  const { n } = a
  const t = QUALITY_THRESHOLDS
  const { maxMs, windowS, smoothS } = t.implausibleClimb
  const half = Math.floor(windowS / 2)
  const level = new Float64Array(n)
  let offset = 0
  for (let i = 0; i < n; i++) {
    offset += steps[i]!
    level[i] = a.altitude[i]! - offset
  }
  const smooth = rollingMean(level, smoothS)
  // A stretch with no known altitude smooths to NaN, which makes the comparison false.
  const tooFast = (i: number): boolean =>
    i >= half && i + half < n && smooth[i + half]! - smooth[i - half]! >= maxMs * 2 * half
  const reach = half + Math.floor(smoothS / 2)
  for (const run of runsWhere(n, tooFast)) {
    raw.push({ kind: 'implausible-climb', start: run.start, end: run.end })
    const start = Math.max(0, run.start - reach)
    const end = Math.min(n, run.end + reach)
    validAltitude.fill(0, start, end)
    validGrade.fill(
      0,
      Math.max(0, start - t.gradeContaminationMarginS),
      Math.min(n, end + t.gradeContaminationMarginS),
    )
  }
}

export function compareKinds(a: QualityKind, b: QualityKind): number {
  return a === b ? 0 : a < b ? -1 : 1
}

/**
 * Joins flags of the same kind that overlap or lie less than flagMergeGapS apart. Input is not
 * modified.
 */
function mergeFlags(raw: RawFlag[]): RawFlag[] {
  const sorted = [...raw].sort((a, b) => compareKinds(a.kind, b.kind) || a.start - b.start)
  const merged: RawFlag[] = []
  for (const f of sorted) {
    const last = merged[merged.length - 1]
    if (last && last.kind === f.kind && f.start - last.end < QUALITY_THRESHOLDS.flagMergeGapS) {
      last.end = Math.max(last.end, f.end)
    } else {
      merged.push({ ...f })
    }
  }
  return merged
}

export function messageFor(kind: QualityKind, durationS: number): string {
  const seconds = `${durationS} second${durationS === 1 ? '' : 's'}`
  const t = QUALITY_THRESHOLDS
  switch (kind) {
    case 'hr-dropout':
      return `Heart rate was missing or too low for ${seconds} while moving`
    case 'hr-spike':
      return 'Heart rate reading jumped to an impossible value'
    case 'hr-implausible-for-power':
      return `Heart rate reads too low for the power being produced for ${seconds}`
    case 'power-spike':
      return 'Power meter reported an impossible spike'
    case 'power-dropout':
      return `Power meter stopped reporting for ${seconds} while moving`
    case 'speed-spike':
      return 'GPS speed jumped to an impossible value'
    case 'implausible-speed':
      return `Speed stayed beyond what anyone can sustain for ${seconds}`
    case 'altitude-jump':
      return `Altitude changed by more than ${t.altitudeJump.maxStepM} m in a single second`
    case 'implausible-climb':
      return `Altitude rose at ${t.implausibleClimb.maxMs} m/s or more for ${seconds}`
    case 'stream-disagreement':
      return `Speed and distance disagreed for ${seconds}`
    case 'missing-altitude':
      return (
        `No altitude was recorded for ${seconds}, so slope-based running cost, virtual power ` +
        'and calibration are left out'
      )
    case 'hr-cadence-lock':
      return `Heart rate matched cadence for ${seconds}`
  }
}

/**
 * Finds sensor problems in an activity and returns per-sample masks. Masks are 1 where the
 * sample may be used. Flags describe each problem span; overlapping or touching flags of the
 * same kind are merged. `disagreements` are the stretches where the activity's speed and distance
 * disagree; a caller that has already compared them passes them, and otherwise they are found here.
 */
export function assessQuality(
  activity: Activity,
  disagreements: AgreedStreams['stretches'] = agreedStreams(activity).stretches,
): QualityReport {
  const { n, speed } = activity
  const validMotion = new Uint8Array(n).fill(1)
  const validPower = new Uint8Array(n).fill(activity.hasPower ? 1 : 0)
  const validGrade = new Uint8Array(n).fill(1)
  const validHeartRate = new Uint8Array(n).fill(activity.hasHeartRate ? 1 : 0)
  const validAltitude = new Uint8Array(n)
  if (activity.hasAltitude) {
    for (let i = 0; i < n; i++) validAltitude[i] = Number.isFinite(activity.altitude[i]!) ? 1 : 0
  }
  const raw: RawFlag[] = []

  for (let i = 0; i < n; i++) {
    if (Number.isNaN(speed[i]!)) validMotion[i] = 0
  }
  const steady = steadyMask(activity.paused, n)
  if (activity.hasHeartRate) heartRateRules(activity, validHeartRate, raw, steady)
  powerRules(activity, validPower, raw)
  motionRules(activity, validMotion, validGrade, validAltitude, raw, steady)
  // Nothing is masked: the digest credits only what both streams support there (agreement.ts).
  for (const stretch of disagreements) {
    raw.push({ kind: 'stream-disagreement', ...stretch })
  }

  const flags: QualityFlag[] = mergeFlags(raw)
    .sort((a, b) => a.start - b.start || compareKinds(a.kind, b.kind))
    .map((f) => ({
      kind: f.kind,
      start: f.start,
      end: f.end,
      message: messageFor(f.kind, f.end - f.start),
    }))

  return { flags, validMotion, validPower, validGrade, validAltitude, validHeartRate }
}
