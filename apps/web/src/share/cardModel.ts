import { PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, EffortCheck } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPace, formatPercent, formatPower } from '@rca/core/units'
import { APP_NAME } from '../appName'
import { effortCaveat, headlineBasis, headlineText } from '../ui/components/headlineText'
import { pickHeadline } from '../ui/components/pickHeadline'
import { plural } from '../ui/components/plural'
import { rangePeriod } from '../ui/components/rangeOptions'

export interface ShareFigure {
  label: string
  value: string
}

/**
 * Everything the share card shows. Built from the analysis on screen; it holds no account, file,
 * activity or date data.
 */
export interface ShareCardModel {
  title: string
  headline: string
  summary: string
  range: string
  /** How the range was set, as the results page words it. */
  basis: string
  /** One line on the heart-rate effort, or null when heart rate does not raise a concern. */
  caveat: string | null
  figures: ShareFigure[]
  /** The selected period and the activity counts per sport. */
  period: string
  footer: string
  /** Site origin when it is public, or an empty string for a local or private address. */
  origin: string
  badge: string | null
}

/** The disclaimer the results page gives for the headline comparison. */
const FOOTER =
  'Estimated from heart rate, pace and power files. This compares estimated energy use, not sporting ability.'

/** Figures are shown up to this many; the card has room for one row of them. */
const MAX_FIGURES = 3

const PRIVATE_IPV4 = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./]

/** Whether a host name is this machine or a private network, so a shared card should not name it. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host.endsWith('.local')) return true
  return PRIVATE_IPV4.some((pattern) => pattern.test(host))
}

/** The origin when it names a public host, otherwise an empty string. */
export function shareableOrigin(origin: string): string {
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return ''
  }
  return isPrivateHost(hostname) ? '' : origin
}

/**
 * The card for the comparison on screen, or null when there is no comparison to share. Reads the
 * same results and formatters as the page, so the card cannot disagree with it.
 */
export function buildShareCard(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  rangeDays: number | null,
  isSample: boolean,
  effort: EffortCheck | null = null,
): ShareCardModel | null {
  const pick = pickHeadline(result.comparison)
  if (pick === null) return null
  const { point, calibrated } = pick
  const text = headlineText(point)
  const duration = formatDuration(point.durationS)

  const figures: ShareFigure[] = []
  if (result.runCp) {
    figures.push({
      label: 'Running threshold pace',
      value: formatPace(metabolicToFlatSpeed(result.runCp.cp), units),
    })
  }
  if (result.rideCp) {
    figures.push({
      label: 'Cycling threshold power',
      value: formatPower(
        metabolicToRidePower(result.rideCp.cp, settings.massKg, PRIORS.grossEfficiency.mean),
      ),
    })
  }
  figures.push({
    label: `Running vs cycling, ${duration}`,
    value: formatPercent(point.ratio.p50 - 1, true),
  })

  const runs = result.activities.filter((activity) => activity.sport === 'run').length
  const rides = result.activities.length - runs

  return {
    title: APP_NAME,
    headline: text.title,
    summary: text.summary,
    range: text.range,
    basis: headlineBasis(result.comparison, calibrated),
    caveat: effortCaveat(effort)?.short ?? null,
    figures: figures.slice(0, MAX_FIGURES),
    period: `${rangePeriod(rangeDays)}: ${plural(runs, 'run')}, ${plural(rides, 'ride')}`,
    footer: FOOTER,
    origin: typeof window === 'undefined' ? '' : shareableOrigin(window.location.origin),
    badge: isSample ? 'Sample data' : null,
  }
}
