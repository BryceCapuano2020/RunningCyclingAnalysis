import type { StackChannel } from './timeSeriesTypes'
import type { CursorHead } from './timeSeriesTypes'

/**
 * The fixed row above the stack. At the cursor it reads each channel's value with the elapsed time and
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
  const at = cursor === null ? null : head(cursor)
  return (
    <div id={id} role="status" className="ts-readout">
      <div className="ts-readout__cell">
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
}
