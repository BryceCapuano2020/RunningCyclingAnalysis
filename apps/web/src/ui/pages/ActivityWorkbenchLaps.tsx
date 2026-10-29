import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { ActivityLap, ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { useSize } from '../charts/useSize'
import { lapChoicesOf } from './workbenchChannels'
import { selectionOf } from './workbenchData'
import { SPORT_READING, displayValue } from './workbenchFormat'
import type { Selection } from './workbenchTime'
import './ActivityWorkbenchLaps.css'

/** More laps than this are a proportional bar, not a row of numbered buttons. */
const MAX_NUMBERED = 8
/** A segment of the bar shows its number only where it is at least this wide, in px. */
const NUMBER_FITS_PX = 22

/** One lap in words, with its figures: "Lap 3 · from 12:00 · 4:31 · 1.0 km · 5:12 /km · 152 bpm". */
function lapLine(
  trace: ActivityTrace,
  lap: ActivityLap,
  label: string,
  units: UnitSystem,
  max: number,
): string {
  const summary = selectionOf(trace, lap.startS, Math.min(lap.endS, max))
  const parts = [
    `${label} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`,
  ]
  if (summary.distanceM !== null && summary.distanceM > 0 && summary.movingS > 0) {
    const reading = SPORT_READING[trace.sport]
    parts.push(reading.speedText(summary.distanceM / summary.movingS, units))
  }
  const heart = summary.metrics.heartRate?.mean
  if (heart !== null && heart !== undefined) {
    parts.push(displayValue('heartRate', heart, trace.sport, units))
  }
  return parts.join(' · ')
}

/**
 * The laps the device recorded, or the intervals found in the readings when it recorded none, as one strip.
 * A few are numbered buttons, as wide as the lap was long and at least a finger wide. Many are a proportional
 * bar, with the chosen lap named and measured in a line under it, so the strip is never a wall of buttons.
 * Choosing one zooms the stack to it; the arrow keys step from lap to lap.
 */
export function LapChoices({
  trace,
  max,
  selection,
  units,
  onSelect,
}: {
  trace: ActivityTrace
  max: number
  selection: Selection
  units: UnitSystem
  onSelect: (selection: Selection) => void
}) {
  const [barRef, barWidth] = useSize()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const titleId = useId()
  const lineId = useId()
  const { recorded, laps } = lapChoicesOf(trace)
  if (laps.length === 0) return null
  const name = recorded ? 'Lap' : 'Interval'
  const bar = laps.length > MAX_NUMBERED
  const boundsOf = (lap: ActivityLap) => ({ startS: lap.startS, endS: Math.min(lap.endS, max) })
  const isActive = (lap: ActivityLap) => {
    const bounds = boundsOf(lap)
    return bounds.startS === selection.startS && bounds.endS === selection.endS
  }
  const chosen = laps.findIndex(isActive)
  const total = laps.reduce((sum, lap) => sum + (lap.endS - lap.startS), 0)

  /** Moves to the lap `to` and focuses it, as the arrow keys do in a group of choices. */
  const go = (to: number) => {
    const at = Math.max(0, Math.min(laps.length - 1, to))
    onSelect(boundsOf(laps[at]!))
    buttons.current[at]?.focus()
  }
  const keyed = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    // Up and Down are left to scroll the page, as the bar is a row and not a column.
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? laps.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    go(next)
  }
  // One segment is in the tab order, the chosen one or the first, and the arrows reach the rest.
  const tabbable = bar ? Math.max(0, chosen) : -1

  return (
    <div className="activity-workbench__laps">
      <h3 id={titleId}>{recorded ? 'Laps' : 'Suggested intervals'}</h3>
      <div className="lap-strip-wrap">
        <div
          ref={barRef}
          className={bar ? 'lap-strip lap-strip--bar' : 'lap-strip'}
          role={bar ? 'group' : undefined}
          aria-labelledby={bar ? titleId : undefined}
        >
          {laps.map((lap, index) => {
            const active = isActive(lap)
            const covered =
              lap.startS < selection.endS && Math.min(lap.endS, max) > selection.startS
            const label = `${name} ${index + 1} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`
            const wide =
              bar && (barWidth * (lap.endS - lap.startS)) / Math.max(1, total) >= NUMBER_FITS_PX
            return (
              <button
                key={`${lap.startS}-${lap.endS}`}
                ref={(node) => {
                  buttons.current[index] = node
                }}
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
                aria-describedby={bar && index === chosen ? lineId : undefined}
                tabIndex={bar ? (index === tabbable ? 0 : -1) : undefined}
                onClick={() => onSelect(boundsOf(lap))}
                onKeyDown={bar ? keyed(index) : undefined}
              >
                {!bar || wide ? index + 1 : null}
              </button>
            )
          })}
        </div>
        {bar && (
          <div className="lap-strip__choose">
            <p id={lineId} className="lap-strip__line secondary">
              {chosen < 0
                ? `${laps.length} ${recorded ? 'laps' : 'intervals'}. Choose one to zoom to it.`
                : lapLine(trace, laps[chosen]!, `${name} ${chosen + 1}`, units, max)}
            </p>
            {/* The bar's segments can be a few px wide, so every lap is also a plain list, which a finger and a keyboard can use. */}
            <select
              className="lap-strip__list"
              aria-label={`Choose ${name.toLowerCase()}`}
              value={chosen < 0 ? '' : String(chosen)}
              onChange={(event) => {
                if (event.currentTarget.value !== '')
                  onSelect(boundsOf(laps[Number(event.currentTarget.value)]!))
              }}
            >
              {chosen < 0 && <option value="">{name}…</option>}
              {laps.map((lap, index) => (
                <option key={`${lap.startS}-${lap.endS}`} value={index}>
                  {`${name} ${index + 1} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
