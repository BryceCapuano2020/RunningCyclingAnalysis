import type { ReactNode } from 'react'
import { PRIORS } from '@rca/core/constants'
import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { EffortCheck } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatPercent, formatPower, formatWkg } from '@rca/core/units'
import { effortCaveat, headlineBasis, headlineText } from './headlineText'
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
  const caveat = effortCaveat(effort)
  if (caveat) return noticeBlock(caveat.text)
  if (effort && effort.runHrFraction !== null && effort.rideHrFraction !== null) {
    return (
      <p className="headline__effort-ok muted">
        Both best efforts reached at least 90% of each sport's heart-rate reference. This does not
        establish that either was all-out.
      </p>
    )
  }
  return null
}

/**
 * The heart rate each sport's best efforts were judged against; nothing when neither is known.
 * A sport's own highest sustained heart rate is named as such. A reference taken from the other
 * sport is labelled with that source.
 */
function referenceNotice(result: AnalysisResult): ReactNode {
  const parts: string[] = []
  const { runMaxHeartRate: run, rideMaxHeartRate: ride } = result
  if (run !== null) {
    const own = run === result.runObservedMaxHeartRate
    parts.push(
      own
        ? `running ${Math.round(run)} bpm (your highest sustained heart rate)`
        : `running ${Math.round(run)} bpm (your cycling maximum)`,
    )
  }
  if (ride !== null) {
    const own = ride === result.rideObservedMaxHeartRate
    parts.push(
      own
        ? `cycling ${Math.round(ride)} bpm (your highest sustained heart rate)`
        : `cycling ${Math.round(ride)} bpm (${RIDE_MAX_OFFSET_BPM} bpm below your running maximum)`,
    )
  }
  if (parts.length === 0) return null
  return <p className="headline__basis muted">Judged against {parts.join('; ')}.</p>
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
  const { title, summary, range } = headlineText(point)
  const basis = headlineBasis(result.comparison, calibrated)
  const tiles = buildTiles(result, units, massKg)
  const notice = effortNotice(effort)

  return (
    <section className="headline">
      <h1 id="results-heading" tabIndex={-1} className="headline__title">
        {title}
      </h1>
      <p className="headline__detail">{summary}</p>
      <p className="headline__range">{range}</p>
      {notice}
      {notice && referenceNotice(result)}
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
