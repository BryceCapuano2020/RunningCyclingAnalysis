import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { ActivityLap, ActivityTrace } from '@rca/core/workbench'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { useSize } from '../charts/useSize'
import { recordedLapsOf } from './workbenchChannels'
import type { Selection } from './workbenchTime'
import './ActivityWorkbenchLaps.css'

/** More laps than this are a proportional bar, not a row of numbered buttons. */
const MAX_NUMBERED = 8
/** A segment of the bar shows its number only where it is at least this wide, in px. */
const NUMBER_FITS_PX = 22

type StripProps = {
  max: number
  selection: Selection
  onSelect: (selection: Selection) => void
}

/** The laps the device recorded, as one strip; choosing a lap zooms the stack to it. Nothing for fewer than two laps. */
export function LapChoices({ trace, ...props }: StripProps & { trace: ActivityTrace }) {
  const laps = recordedLapsOf(trace)
  return laps.length === 0 ? null : <LapStrip {...props} laps={laps} />
}

/**
 * One group of laps as a strip. A few are numbered buttons, as wide as the lap was long and at least a finger wide. Many are a
 * proportional bar, with every lap also in a list beside it, so the strip is never a wall of buttons.
 * The arrow keys step from lap to lap.
 */
function LapStrip({ max, selection, onSelect, laps }: StripProps & { laps: ActivityLap[] }) {
  const [barRef, barWidth] = useSize()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const titleId = useId()
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
      <h3 id={titleId}>Laps</h3>
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
            const label = `Lap ${index + 1} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`
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
            {/* The bar's segments can be a few px wide, so every lap is also a plain list, which a finger and a keyboard can use. */}
            <select
              className="lap-strip__list"
              aria-label={'Choose lap'}
              value={chosen < 0 ? '' : String(chosen)}
              onChange={(event) => {
                if (event.currentTarget.value !== '')
                  onSelect(boundsOf(laps[Number(event.currentTarget.value)]!))
              }}
            >
              {chosen < 0 && <option value="">{`${laps.length} laps`}</option>}
              {laps.map((lap, index) => (
                <option key={`${lap.startS}-${lap.endS}`} value={index}>
                  {`Lap ${index + 1} · from ${formatRecordTime(lap.startS)} · ${formatTotalTime(lap.endS - lap.startS)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
