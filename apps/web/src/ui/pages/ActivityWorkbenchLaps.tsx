import type { ActivityTrace } from '@rca/core/workbench'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { lapChoicesOf } from './workbenchChannels'
import type { Selection } from './workbenchTime'
import './ActivityWorkbenchLaps.css'

/**
 * The laps the device recorded, or the intervals found in the readings when it recorded none, as one strip:
 * a segment for each, as wide as it was long, and at least a finger wide. Choosing one zooms the stack to it.
 * The segments the selection covers are tinted, and the one it is exactly is marked.
 */
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
  const { recorded, laps } = lapChoicesOf(trace)
  if (laps.length === 0) return null
  const name = recorded ? 'Lap' : 'Interval'
  return (
    <div className="activity-workbench__laps">
      <h3>{recorded ? 'Laps' : 'Suggested intervals'}</h3>
      <div className="lap-strip">
        {laps.map((lap, index) => {
          const bounds = { startS: lap.startS, endS: Math.min(lap.endS, max) }
          const active = bounds.startS === selection.startS && bounds.endS === selection.endS
          const covered = bounds.startS < selection.endS && bounds.endS > selection.startS
          const label = `${name} ${index + 1} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`
          return (
            <button
              key={`${lap.startS}-${lap.endS}`}
              className={
                active
                  ? 'lap-strip__segment activity-workbench__lap--active'
                  : covered
                    ? 'lap-strip__segment lap-strip__segment--covered'
                    : 'lap-strip__segment'
              }
              style={{ flexGrow: lap.endS - lap.startS }}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => onSelect(bounds)}
            >
              {index + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
