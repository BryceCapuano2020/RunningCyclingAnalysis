import type { DigestSplit, DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import {
  METRES_PER_KM,
  METRES_PER_MILE,
  formatDistance,
  formatElevation,
  formatPace,
} from '@rca/core/units'
import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '@rca/core/constants'
import { SPLITS_NOT_LOADED } from '../analysis/copy'
import './SplitsTable.css'

/** What the page knows about one run's splits: still loading, not loaded, or loaded. */
export type SplitsLoad =
  | { status: 'loading' }
  | { status: 'failed' }
  /** `splits` is null when the run's digest was made before splits were kept. */
  | { status: 'loaded'; splits: DigestSplits | null }

export interface SplitsTableProps {
  load: SplitsLoad
  units: UnitSystem
  /** The run's distance, which tells a run past the limit from one too short to split. */
  distanceM: number
}

/** One row, as both representations show it. A null field is a value the digest could not give. */
interface SplitCells {
  label: string
  fastest: boolean
  pace: string | null
  /** Width of the pace bar, from zero to the fastest known pace, as a percentage. */
  barPercent: number | null
  gradeAdjustedPace: string | null
  elevation: string | null
  heartRate: string | null
}

const UNIT_NAME: Record<UnitSystem, string> = { imperial: 'mile', metric: 'kilometre' }

/** A value the digest could not give: a dash for sight, and words for a screen reader. */
function Missing({ words }: { words: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{words}</span>
    </>
  )
}

/**
 * The rows in display form. A split whose time is unknown has no pace, so it is not marked fastest
 * and does not set the bar scale. Elevation is shown whenever the activity has altitude, even when
 * its grade-adjusted time is unknown.
 */
function cellsOf(rows: DigestSplit[], units: UnitSystem): SplitCells[] {
  const unitMetres = units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM
  const speeds = rows.map((split) =>
    split.seconds === null ? null : split.distanceM / split.seconds,
  )
  const known = speeds.filter((speed): speed is number => speed !== null)
  const fastest = known.length > 0 ? Math.max(...known) : null
  // Only the first split at the fastest pace is marked, so a tie does not mark two rows.
  const fastestIndex = fastest === null ? -1 : speeds.indexOf(fastest)
  return rows.map((split, index) => {
    const speed = speeds[index]!
    const gradeAdjusted = split.gradeAdjustedSeconds
    return {
      label: split.distanceM < unitMetres ? formatDistance(split.distanceM, units) : `${index + 1}`,
      fastest: index === fastestIndex,
      pace: speed === null ? null : formatPace(speed, units),
      barPercent: speed === null || fastest === null ? null : (speed / fastest) * 100,
      gradeAdjustedPace:
        gradeAdjusted === null ? null : formatPace(split.distanceM / gradeAdjusted, units),
      elevation:
        split.elevationGainM === null ? null : formatElevation(split.elevationGainM, units),
      heartRate: split.avgHeartRate === null ? null : `${Math.round(split.avgHeartRate)} bpm`,
    }
  })
}

/** The pace value, with the Fastest chip beside it when this split is the fastest. */
function PaceValue({ cell }: { cell: SplitCells }) {
  if (cell.pace === null) return <Missing words="Not measured" />
  return (
    <>
      <span className={cell.fastest ? 'splits-table__fastest' : undefined}>{cell.pace}</span>
      {cell.fastest && <span className="chip">Fastest</span>}
    </>
  )
}

/** The pace bar. Decorative: the pace beside it carries the same information. */
function PaceBar({ percent }: { percent: number | null }) {
  if (percent === null) return null
  return (
    <span className="splits-table__track" aria-hidden="true">
      <span className="splits-table__bar" style={{ width: `${percent}%` }} />
    </span>
  )
}

/** One split as a row of the table. */
function SplitRow({ cell }: { cell: SplitCells }) {
  return (
    <tr>
      <th scope="row">{cell.label}</th>
      <td className="num splits-table__pace">
        <PaceValue cell={cell} />
        <PaceBar percent={cell.barPercent} />
      </td>
      <td className="num">{cell.gradeAdjustedPace ?? <Missing words="Not available" />}</td>
      <td className="num">{cell.elevation ?? <Missing words="No altitude" />}</td>
      <td className="num">{cell.heartRate ?? <Missing words="No heart rate" />}</td>
    </tr>
  )
}

/** The splits as a table, shown from 480 px wide. */
function SplitTable({ cells, caption }: { cells: SplitCells[]; caption: string }) {
  return (
    <div className="splits-wide">
      <table className="splits-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Split</th>
            <th scope="col" className="num">
              Pace
            </th>
            <th scope="col" className="num">
              Grade-adjusted pace
            </th>
            <th scope="col" className="num">
              Elevation gain
            </th>
            <th scope="col" className="num">
              Heart rate
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <SplitRow key={cell.label} cell={cell} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One split as an item of the list, below 480 px. Its values are the row's. */
function SplitItem({ cell }: { cell: SplitCells }) {
  return (
    <li className="splits-list__item">
      <dl>
        <div>
          <dt>Split</dt>
          <dd>{cell.label}</dd>
        </div>
        <div>
          <dt>Pace</dt>
          <dd>
            <PaceValue cell={cell} />
            <PaceBar percent={cell.barPercent} />
          </dd>
        </div>
        <div>
          <dt>Grade-adjusted pace</dt>
          <dd>{cell.gradeAdjustedPace ?? <Missing words="Not available" />}</dd>
        </div>
        <div>
          <dt>Elevation gain</dt>
          <dd>{cell.elevation ?? <Missing words="No altitude" />}</dd>
        </div>
        <div>
          <dt>Heart rate</dt>
          <dd>{cell.heartRate ?? <Missing words="No heart rate" />}</dd>
        </div>
      </dl>
    </li>
  )
}

/** The same splits, one definition list per split, below 480 px. */
function SplitList({ cells, caption }: { cells: SplitCells[]; caption: string }) {
  return (
    <ol className="splits-list" aria-label={caption}>
      {cells.map((cell) => (
        <SplitItem key={cell.label} cell={cell} />
      ))}
    </ol>
  )
}

/** Why a unit has no splits: the run is past the limit for that unit, or too short to split. */
function noSplitsCopy(distanceM: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return distanceM > MAX_MILE_SPLITS * METRES_PER_MILE
      ? `Splits are kept for runs up to ${MAX_MILE_SPLITS} mi.`
      : 'This run is too short to split.'
  }
  return distanceM > MAX_KM_SPLITS * METRES_PER_KM
    ? `Splits are kept for runs up to ${MAX_KM_SPLITS} km.`
    : 'This run is too short to split.'
}

function SplitsRows({
  splits,
  units,
  distanceM,
}: {
  splits: DigestSplits
  units: UnitSystem
  distanceM: number
}) {
  const rows = units === 'imperial' ? splits.mile : splits.km
  if (rows.length === 0) return <p className="secondary">{noSplitsCopy(distanceM, units)}</p>
  const cells = cellsOf(rows, units)
  const caption = `Pace for each ${UNIT_NAME[units]}`
  return (
    <>
      <SplitTable cells={cells} caption={caption} />
      <SplitList cells={cells} caption={caption} />
    </>
  )
}

/** The run's splits in the unit the athlete reads. Both representations are rendered; CSS shows one. */
export function SplitsTable({ load, units, distanceM }: SplitsTableProps) {
  return (
    <section className="section" aria-labelledby="activity-splits">
      <h2 id="activity-splits">Splits</h2>
      {load.status === 'loading' ? (
        <p className="secondary">Loading splits.</p>
      ) : load.status === 'failed' ? (
        <p className="secondary">{SPLITS_NOT_LOADED}</p>
      ) : load.splits === null ? (
        <p className="secondary">Splits were not kept when this run was added.</p>
      ) : (
        <SplitsRows splits={load.splits} units={units} distanceM={distanceM} />
      )}
    </section>
  )
}
