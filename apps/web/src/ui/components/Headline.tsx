import type { ReactNode } from 'react'
import { PRIORS } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { EffortCheck, Interval } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPace, formatPercent, formatPower, formatWkg } from '@rca/core/units'
import { pickHeadline } from './pickHeadline'
import { plural } from './plural'
import './Headline.css'

export interface HeadlineProps {
  result: AnalysisResult
  units: UnitSystem
  /** Body mass, kg. Converts the cycling threshold from W/kg to watts. */
  massKg: number
  /** Heart-rate check for the headline duration. Null or missing when it is unavailable. */
  effort?: EffortCheck | null
}

interface Tile {
  label: string
  value: string
  sub: string
}

/** Best efforts below this share of the highest heart rate were probably not all-out. */
const ALL_OUT = 0.9

/** States which sport the model estimates uses more energy rate per kg, or that the estimates overlap. */
function headlineTitle(ratio: Interval, duration: string): string {
  if (ratio.p05 > 1) {
    return `Over ${duration}, your running is estimated to use ${formatPercent(ratio.p50 - 1)} more energy rate per kg than your cycling`
  }
  if (ratio.p95 < 1) {
    return `Over ${duration}, your cycling is estimated to use ${formatPercent(1 / ratio.p50 - 1)} more energy rate per kg than your running`
  }
  return 'Your running and cycling energy estimates overlap'
}

function missingSportCopy(result: AnalysisResult): string {
  const hasRun = result.activities.some((a) => a.sport === 'run')
  const hasRide = result.activities.some((a) => a.sport === 'ride')
  if (!hasRun && !hasRide) return 'Your files have no running or cycling activities yet.'
  if (!hasRun) return 'Your files have no running activities yet.'
  if (!hasRide) return 'Your files have no cycling activities yet.'
  return 'Both sports are in your files, but no efforts could be compared yet.'
}

function buildTiles(result: AnalysisResult, units: UnitSystem, massKg: number): Tile[] {
  const tiles: Tile[] = []
  if (result.runCp) {
    tiles.push({
      label: 'Running threshold pace',
      value: formatPace(metabolicToFlatSpeed(result.runCp.cp), units),
      sub: formatWkg(result.runCp.cp),
    })
  }
  if (result.rideCp) {
    tiles.push({
      label: 'Cycling threshold power',
      value: formatPower(
        metabolicToRidePower(result.rideCp.cp, massKg, PRIORS.grossEfficiency.mean),
      ),
      sub: formatWkg(result.rideCp.cp),
    })
  }
  const accuracy = result.virtualAccuracy
  if (accuracy && accuracy.nSegments > 0) {
    tiles.push({
      label: 'Mean absolute virtual power error',
      value: formatPercent(accuracy.mape),
      sub: `${plural(accuracy.nSegments, 'climb')} tested`,
    })
  }
  const runs = result.activities.filter((a) => a.sport === 'run').length
  const rides = result.activities.length - runs
  tiles.push({
    label: 'Activities analysed',
    value: String(result.activities.length),
    sub: `${plural(runs, 'run')}, ${plural(rides, 'ride')}`,
  })
  return tiles
}

function WarningIcon() {
  return (
    <svg className="headline__effort-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 2 14.5 13.5h-13Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  )
}

function noticeBlock(text: string): ReactNode {
  return (
    <div className="headline__effort">
      <WarningIcon />
      <p>{text}</p>
    </div>
  )
}

/** The effort notice, or nothing when heart rate cannot say how hard the efforts were. */
function effortNotice(effort: EffortCheck | null | undefined): ReactNode {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && run < ALL_OUT && ride !== null && ride < ALL_OUT) {
    return noticeBlock(
      `Both best efforts over ${duration} were below 90% of your highest recorded heart rate ` +
        `(running ${Math.round(run * 100)}%, cycling ${Math.round(ride * 100)}%). Your library may be missing harder efforts.`,
    )
  }
  if (ride !== null && ride < ALL_OUT) {
    return noticeBlock(
      `Your best cycling effort over ${duration} reached ${Math.round(ride * 100)}% of your highest ` +
        `recorded heart rate. Your library may be missing a harder cycling effort.`,
    )
  }
  if (run !== null && run < ALL_OUT) {
    return noticeBlock(
      `Your best running effort over ${duration} reached ${Math.round(run * 100)}% of your highest ` +
        `recorded heart rate. Your library may be missing a harder running effort.`,
    )
  }
  if (run !== null && ride !== null) {
    return (
      <p className="headline__effort-ok muted">
        Both best efforts reached at least 90% of your highest recorded heart rate. This does not
        establish that either was all-out.
      </p>
    )
  }
  return null
}

export function Headline({ result, units, massKg, effort }: HeadlineProps) {
  const pick = pickHeadline(result.comparison)
  if (pick === null) {
    return (
      <section className="headline">
        <h1 id="results-heading" tabIndex={-1} className="headline__title">
          Add at least one run and one ride
        </h1>
        <p className="headline__detail secondary">{missingSportCopy(result)}</p>
      </section>
    )
  }

  const { point, calibrated } = pick
  const duration = formatDuration(point.durationS)
  const summary =
    `Over ${duration}, your estimated running energy rate is ` +
    `${formatWkg(point.runMetabolic.p50)} and your cycling energy rate is ` +
    `${formatWkg(point.rideMetabolic.p50)}.`
  const range =
    `90% model range: ${formatPercent(point.ratio.p05 - 1, true)} to ` +
    `${formatPercent(point.ratio.p95 - 1, true)}.`
  const basis =
    result.comparison.calibration?.accepted === false
      ? 'The heart-rate check could not support a reliable adjustment; showing the population-based model range.'
      : calibrated
        ? 'Model range adjusted using your heart-rate data.'
        : 'Model range based on population assumptions.'
  const tiles = buildTiles(result, units, massKg)

  return (
    <section className="headline">
      <h1 id="results-heading" tabIndex={-1} className="headline__title">
        {headlineTitle(point.ratio, duration)}
      </h1>
      <p className="headline__detail">{summary}</p>
      <p className="headline__range">{range}</p>
      {effortNotice(effort)}
      <p className="headline__basis muted">{basis}</p>
      <p className="headline__basis muted">
        This compares estimated energy use, not sporting ability. The range does not include every
        source of error.
      </p>
      <ul className="headline__tiles">
        {tiles.map((tile) => (
          <li key={tile.label} className="headline__tile">
            <p className="headline__tile-label secondary">{tile.label}</p>
            <p className="headline__tile-value num">{tile.value}</p>
            <p className="headline__tile-sub muted">{tile.sub}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
