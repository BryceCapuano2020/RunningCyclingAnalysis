import type { Comparison, ComparisonPoint, EffortCheck, Interval } from '@rca/core/types'
import { formatDuration, formatPercent, formatWkg } from '@rca/core/units'

export interface HeadlineText {
  /** The sentence the results heading states. */
  title: string
  /** The energy rate each sport is estimated at over the duration. */
  summary: string
  /** The 90% model range as signed percentages. */
  range: string
}

/** Best efforts below this share of the highest heart rate were probably not all-out. */
const ALL_OUT = 0.9

/** States which sport the model estimates uses more energy rate per kg, or that the estimates overlap. */
function titleFor(ratio: Interval, duration: string): string {
  if (ratio.p05 > 1) {
    return `Over ${duration}, your running is estimated to use ${formatPercent(ratio.p50 - 1)} more energy rate per kg than your cycling`
  }
  if (ratio.p95 < 1) {
    return `Over ${duration}, your cycling is estimated to use ${formatPercent(1 / ratio.p50 - 1)} more energy rate per kg than your running`
  }
  return 'Your running and cycling energy estimates overlap'
}

/** The headline sentences for one comparison point. The results page and the share card both read them. */
export function headlineText(point: ComparisonPoint): HeadlineText {
  const duration = formatDuration(point.durationS)
  return {
    title: titleFor(point.ratio, duration),
    summary:
      `Over ${duration}, your estimated running energy rate is ` +
      `${formatWkg(point.runMetabolic.p50)} and your cycling energy rate is ` +
      `${formatWkg(point.rideMetabolic.p50)}.`,
    range:
      `90% model range: ${formatPercent(point.ratio.p05 - 1, true)} to ` +
      `${formatPercent(point.ratio.p95 - 1, true)}.`,
  }
}

/** How the range was set: a rejected heart-rate check, an adjusted range, or population assumptions. */
export function headlineBasis(comparison: Comparison, calibrated: boolean): string {
  if (comparison.calibration?.accepted === false) {
    return 'The heart-rate check could not support a reliable adjustment; showing the population-based model range.'
  }
  return calibrated
    ? 'Model range adjusted using your heart-rate data.'
    : 'Model range based on population assumptions.'
}

export interface EffortCaveat {
  /** The sentence the results page shows under the headline. */
  text: string
  /** One line for the share card. */
  short: string
}

/** Why the best efforts may not have been all-out, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && run < ALL_OUT && ride !== null && ride < ALL_OUT) {
    return {
      text:
        `Both best efforts over ${duration} were below 90% of each sport's heart-rate reference ` +
        `(running ${Math.round(run * 100)}%, cycling ${Math.round(ride * 100)}%). Your library may be missing harder efforts.`,
      short: `Best efforts over ${duration} may not have been all-out.`,
    }
  }
  if (ride !== null && ride < ALL_OUT) {
    return {
      text:
        `Your best cycling effort over ${duration} reached ${Math.round(ride * 100)}% of the cycling ` +
        `heart-rate reference. Your library may be missing a harder cycling effort.`,
      short: `Best cycling effort over ${duration} may not have been all-out.`,
    }
  }
  if (run !== null && run < ALL_OUT) {
    return {
      text:
        `Your best running effort over ${duration} reached ${Math.round(run * 100)}% of the running ` +
        `heart-rate reference. Your library may be missing a harder running effort.`,
      short: `Best running effort over ${duration} may not have been all-out.`,
    }
  }
  return null
}
