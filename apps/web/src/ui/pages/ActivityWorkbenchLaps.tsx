import type { ActivityLap, ActivityTrace } from '@rca/core/workbench'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { suggestedIntervals } from './workbenchData'
import type { Selection } from './workbenchTime'

/** The laps the device recorded, or the intervals found in the readings when it recorded none. */
export function LapChoices({
  trace,
  max,
  selection,
  onSelect,
}: {
  trace: ActivityTrace
  max: number
  selection: Selection
  onSelect: (selection: Selection) => void
}) {
  const recorded = trace.laps.length > 0
  const laps: ActivityLap[] = recorded ? trace.laps : suggestedIntervals(trace)
  if (laps.length === 0) return null
  const name = recorded ? 'Lap' : 'Interval'
  return (
    <div className="activity-workbench__laps">
      <h3>{recorded ? 'Laps' : 'Suggested intervals'}</h3>
      <div className="activity-workbench__lap-buttons">
        {laps.map((lap, index) => {
          const bounds = { startS: lap.startS, endS: Math.min(lap.endS, max) }
          const active = bounds.startS === selection.startS && bounds.endS === selection.endS
          return (
            <button
              key={`${lap.startS}-${lap.endS}`}
              className={active ? 'btn activity-workbench__lap--active' : 'btn'}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(bounds)}
            >
              {name} {index + 1} · from {formatRecordTime(lap.startS)} ·{' '}
              {formatTotalTime(lap.endS - lap.startS)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
