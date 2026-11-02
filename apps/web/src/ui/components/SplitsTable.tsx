import { useMemo } from 'react'
import type { DigestSplits } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { METRES_PER_KM, METRES_PER_MILE } from '@rca/core/units'
import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '@rca/core/constants'
import { SPLITS_NOT_LOADED } from '../analysis/copy'
import './SplitsTable.css'
import { hasRecordedLaps, lapCellsOf } from './lapRows'
import { Rows } from './SplitsGrid'
import { cellsOf, columnsOf, rowsOf, type SplitsLoad, type SplitsViewName } from './splitRows'

export interface SplitsTableProps {
  load: SplitsLoad
  units: UnitSystem
  /** The run's distance, which tells a run past the limit from one too short to split. */
  distanceM: number
  /** The activity's recorded detail, whose device laps are offered as a second view of the splits. */
  trace?: ActivityTrace | null
  /** The view that is open, which the page holds so the bests' timing note can follow it. Defaults to the units. */
  view?: SplitsViewName
  onViewChange?: (view: SplitsViewName) => void
}

const UNIT_NAME: Record<UnitSystem, string> = { imperial: 'mile', metric: 'kilometre' }

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
  const rows = rowsOf(splits, units)
  if (rows.length === 0) return <p className="secondary">{noSplitsCopy(distanceM, units)}</p>
  const cells = cellsOf(rows, units)
  return (
    <Rows
      cells={cells}
      caption={`Pace for each ${UNIT_NAME[units]}`}
      columns={columnsOf(rows, cells)}
    />
  )
}

/** The choice between the whole units and the laps the device recorded, as a pair of toggle buttons. */
function ViewChoice({
  view,
  units,
  onChange,
}: {
  view: SplitsViewName
  units: UnitSystem
  onChange: (view: SplitsViewName) => void
}) {
  const choices: [SplitsViewName, string][] = [
    ['units', units === 'imperial' ? 'Miles' : 'Kilometres'],
    ['laps', 'Laps'],
  ]
  return (
    <div className="splits-view" role="group" aria-label="Split view">
      {choices.map(([choice, name]) => (
        <button
          key={choice}
          type="button"
          className={view === choice ? 'btn splits-view__choice--active' : 'btn'}
          aria-pressed={view === choice}
          onClick={() => onChange(choice)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

/** The laps the device recorded, as splits: each lap's time, distance, pace and heart rate. */
function LapRows({ trace, units }: { trace: ActivityTrace; units: UnitSystem }) {
  const cells = useMemo(() => lapCellsOf(trace, units), [trace, units])
  return (
    <Rows
      cells={cells}
      caption="Pace for each lap the device recorded"
      columns={{ flat: false, elevation: false, steepDescent: false, lap: true }}
    />
  )
}

/** Whether the digest has any whole-unit split to show, in the unit the athlete reads. */
function hasUnitSplits(load: SplitsLoad, units: UnitSystem): boolean {
  return load.status === 'loaded' && load.splits !== null && rowsOf(load.splits, units).length > 0
}

/** The splits once they have loaded, with the device's laps as a second view where it recorded them. */
function LoadedSplits({
  load,
  units,
  distanceM,
  trace,
  view,
  onViewChange,
}: {
  load: Extract<SplitsLoad, { status: 'loaded' }>
  units: UnitSystem
  distanceM: number
  trace: ActivityTrace | null
  view: SplitsViewName
  onViewChange: (view: SplitsViewName) => void
}) {
  const laps = hasRecordedLaps(trace) ? trace : null
  if (laps !== null && !hasUnitSplits(load, units)) return <LapRows trace={laps} units={units} />
  const rows =
    load.splits === null ? (
      <p className="secondary">Splits were not kept when this run was added.</p>
    ) : (
      <SplitsRows splits={load.splits} units={units} distanceM={distanceM} />
    )
  if (laps === null) return rows
  return (
    <>
      <ViewChoice view={view} units={units} onChange={onViewChange} />
      {view === 'laps' ? <LapRows trace={laps} units={units} /> : rows}
    </>
  )
}

function ignoreView() {}

/** The run's splits in the unit the athlete reads. Both representations are rendered; CSS shows one. */
export function SplitsTable({
  load,
  units,
  distanceM,
  trace = null,
  view = 'units',
  onViewChange = ignoreView,
}: SplitsTableProps) {
  return (
    <section className="section" aria-labelledby="activity-splits">
      <h2 id="activity-splits">Splits</h2>
      {load.status === 'loading' ? (
        <p className="secondary">Loading splits.</p>
      ) : load.status === 'failed' ? (
        <p className="secondary">{SPLITS_NOT_LOADED}</p>
      ) : (
        <LoadedSplits
          load={load}
          units={units}
          distanceM={distanceM}
          trace={trace}
          view={view}
          onViewChange={onViewChange}
        />
      )}
    </section>
  )
}
