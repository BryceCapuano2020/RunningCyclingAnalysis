import { PRIORS } from '../../core/constants'
import type { AnalysisResult } from '../../core/pipeline'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../../core/metabolic'
import type { Interval } from '../../core/types'
import type { UnitSystem } from '../../core/units'
import { formatDuration, formatPace, formatPercent, formatPower, formatWkg } from '../../core/units'
import { pickHeadline } from './pickHeadline'
import { plural } from './plural'
import './Headline.css'

export interface HeadlineProps {
  result: AnalysisResult
  units: UnitSystem
  /** Body mass, kg. Converts the cycling threshold from W/kg to watts. */
  massKg: number
}

interface Tile {
  label: string
  value: string
  sub: string
}

function headlineTitle(ratio: Interval): string {
  const d = ratio.p50 - 1
  if (ratio.p05 > 1) return `Your running is ${formatPercent(d)} stronger than your cycling`
  if (ratio.p95 < 1) return `Your cycling is ${formatPercent(-d)} stronger than your running`
  return 'Your running and cycling are too close to call'
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
      label: 'Virtual power meter error',
      value: `±${formatPercent(accuracy.mape)}`,
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

export function Headline({ result, units, massKg }: HeadlineProps) {
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
  const summary =
    `Over ${formatDuration(point.durationS)}, your best running burns ` +
    `${formatWkg(point.runMetabolic.p50)} and your best cycling burns ` +
    `${formatWkg(point.rideMetabolic.p50)}. ` +
    `The gap is probably between ${formatPercent(point.ratio.p05 - 1, true)} and ` +
    `${formatPercent(point.ratio.p95 - 1, true)}.`
  const basis = calibrated
    ? 'Range narrowed using your heart-rate data'
    : 'Range based on population averages. Add more runs and rides with heart rate to narrow it'
  const tiles = buildTiles(result, units, massKg)

  return (
    <section className="headline">
      <h1 id="results-heading" tabIndex={-1} className="headline__title">
        {headlineTitle(point.ratio)}
      </h1>
      <p className="headline__detail">{summary}</p>
      <p className="headline__basis muted">{basis}</p>
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
