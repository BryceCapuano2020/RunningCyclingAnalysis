import { rollingMean } from '../math'
import type { Activity, QualityFlag, QualityKind, QualityReport } from '../types'

/** Every threshold used by assessQuality. Samples are 1 Hz, so samples and seconds are the same. */
export const QUALITY_THRESHOLDS = {
  /** Heart rate below this, or NaN, counts as a dropout. */
  minValidBpm: 30,
  hrDropout: { minDurationS: 10, movingSpeedMs: 0.5, movingFraction: 0.5 },
  hrSpike: { maxBpm: 230, maxStepBpm: 15, marginS: 5 },
  hrImplausibleForPower: { windowS: 300, minPowerW: 200, maxHrBpm: 110 },
  powerSpike: { maxW: 2000, marginS: 1 },
  powerDropout: { minDurationS: 5, minSpeedMs: 3 },
  speedSpike: { maxSpeedMs: { run: 12.5, ride: 30 }, maxStepMs: 5, marginS: 3 },
  altitudeJump: { maxStepM: 10, marginS: 10 },
  /** Same-kind flags closer than this, in seconds, are one flag, so noisy sensors do not multiply flags. */
  flagMergeGapS: 10,
} as const

interface Range {
  start: number
  end: number
}

interface RawFlag extends Range {
  kind: QualityKind
}

/** Maximal runs of consecutive indices in [0, n) for which pred holds. */
function runsWhere(n: number, pred: (i: number) => boolean): Range[] {
  const runs: Range[] = []
  let i = 0
  while (i < n) {
    if (!pred(i)) {
      i++
      continue
    }
    const start = i
    while (i < n && pred(i)) i++
    runs.push({ start, end: i })
  }
  return runs
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
  const { n, speed, heartRate, power, paused } = a
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
    const window = t.hrImplausibleForPower.windowS
    const powerMean = rollingMean(power, window)
    const hrMean = rollingMean(heartRate, window)
    const implausible = (i: number): boolean =>
      powerMean[i]! >= t.hrImplausibleForPower.minPowerW &&
      hrMean[i]! < t.hrImplausibleForPower.maxHrBpm
    for (const run of runsWhere(n, implausible)) {
      markRange(raw, validHr, 'hr-implausible-for-power', run)
    }
  }
}

function powerRules(a: Activity, validMotion: Uint8Array, raw: RawFlag[]): void {
  if (!a.hasPower) return
  const { n, speed, power } = a
  const t = QUALITY_THRESHOLDS

  for (let i = 0; i < n; i++) {
    if (power[i]! > t.powerSpike.maxW) {
      markRange(raw, validMotion, 'power-spike', around(i, t.powerSpike.marginS, n))
    }
  }

  const missing = (i: number): boolean => Number.isNaN(power[i]!) && a.paused[i] !== 1
  const fast = (i: number): boolean => speed[i]! > t.powerDropout.minSpeedMs
  for (const run of runsWhere(n, missing)) {
    if (run.end - run.start < t.powerDropout.minDurationS) continue
    if (every(run, fast)) markRange(raw, validMotion, 'power-dropout', run)
  }
}

function motionRules(
  a: Activity,
  validMotion: Uint8Array,
  raw: RawFlag[],
  steady: Uint8Array,
): void {
  const { n, speed, altitude } = a
  const t = QUALITY_THRESHOLDS
  const maxSpeed = t.speedSpike.maxSpeedMs[a.sport]

  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const jumped = i > 0 && steady[i] === 1 && Math.abs(v - speed[i - 1]!) > t.speedSpike.maxStepMs
    if (v > maxSpeed || jumped) {
      markRange(raw, validMotion, 'speed-spike', around(i, t.speedSpike.marginS, n))
    }
  }

  if (!a.hasAltitude) {
    if (n > 0 && !a.indoor) raw.push({ kind: 'missing-altitude', start: 0, end: n })
    return
  }
  for (let i = 1; i < n; i++) {
    const jump = Math.abs(altitude[i]! - altitude[i - 1]!) > t.altitudeJump.maxStepM
    if (steady[i] === 1 && jump) {
      markRange(raw, validMotion, 'altitude-jump', around(i, t.altitudeJump.marginS, n))
    }
  }
}

function compareKinds(a: QualityKind, b: QualityKind): number {
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

function messageFor(kind: QualityKind, durationS: number): string {
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
    case 'altitude-jump':
      return `Altitude changed by more than ${t.altitudeJump.maxStepM} m in a single second`
    case 'missing-altitude':
      return `No altitude was recorded for ${seconds}`
  }
}

/**
 * Finds sensor problems in an activity and returns per-sample masks. Masks are 1 where the
 * sample may be used. Flags describe each problem span; overlapping or touching flags of the
 * same kind are merged.
 */
export function assessQuality(activity: Activity): QualityReport {
  const { n, speed } = activity
  const validMotion = new Uint8Array(n).fill(1)
  const validHeartRate = new Uint8Array(n).fill(activity.hasHeartRate ? 1 : 0)
  const raw: RawFlag[] = []

  for (let i = 0; i < n; i++) {
    if (Number.isNaN(speed[i]!)) validMotion[i] = 0
  }
  const steady = steadyMask(activity.paused, n)
  if (activity.hasHeartRate) heartRateRules(activity, validHeartRate, raw, steady)
  powerRules(activity, validMotion, raw)
  motionRules(activity, validMotion, raw, steady)

  const flags: QualityFlag[] = mergeFlags(raw)
    .sort((a, b) => a.start - b.start || compareKinds(a.kind, b.kind))
    .map((f) => ({
      kind: f.kind,
      start: f.start,
      end: f.end,
      message: messageFor(f.kind, f.end - f.start),
    }))

  return { flags, validMotion, validHeartRate }
}
