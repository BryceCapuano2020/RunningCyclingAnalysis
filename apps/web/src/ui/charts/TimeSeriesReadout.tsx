import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { ReadoutContext } from './readoutContext'
import type { StackChannel } from './timeSeriesTypes'
import type { CursorHead } from './timeSeriesTypes'

/**
 * The fixed row above the stack, which is the chart system's readout row (ChartFrame keeps one above a phone's
 * plot and a tooltip draws into it): this draws into the row the stack hosts, at every width, since five
 * measures at once would cover the plot if they floated. At the cursor it reads each channel's value with the elapsed time and
 * distance; with no cursor it reads the selection's averages, so the row is never empty and never moves
 * the plot. It is one status element, so a keyboard reader hears the values as the cursor steps.
 */
export function TimeSeriesReadout({
  id,
  channels,
  cursor,
  head,
}: {
  id: string
  channels: readonly StackChannel[]
  cursor: number | null
  head: (second: number) => CursorHead
}) {
  const host = useContext(ReadoutContext)
  const at = cursor === null ? null : head(cursor)
  const readout = (
    <div id={id} role="status" className="ts-readout">
      {/* The title class is what the readout row looks for to know it holds a reading, not its hint. */}
      <div className="ts-readout__cell chart-tooltip__title">
        <span className="ts-readout__label">{at === null ? 'Selection' : 'Elapsed'}</span>
        <span className="ts-readout__value">{at === null ? 'Average' : at.time}</span>
        {at !== null && at.distance !== null && (
          <span className="ts-readout__unit">{at.distance}</span>
        )}
      </div>
      {channels.map((channel) => {
        const reading = cursor === null ? channel.average : channel.at(cursor)
        return (
          <div key={channel.key} className={`ts-readout__cell ts-ch ts-ch--${channel.colour}`}>
            <span className="ts-readout__label">
              <span className="ts-readout__swatch" aria-hidden="true" />
              <span className="ts-readout__name">{channel.short}</span>
            </span>
            <span
              className={
                reading === null ? 'ts-readout__value ts-readout__value--none' : 'ts-readout__value'
              }
            >
              {reading === null ? 'No reading' : reading.value}
            </span>
            {reading !== null && <span className="ts-readout__unit">{reading.unit}</span>}
          </div>
        )
      })}
    </div>
  )
  return host === null ? readout : createPortal(readout, host)
}
