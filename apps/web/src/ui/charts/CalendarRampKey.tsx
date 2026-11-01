import { RAMP_STEPS } from './calendarRamp'

/** An edge as the key writes it: whole hours bare, else a tenth. */
const edgeText = (hours: number): string =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1)

/**
 * The key of the ramp: none, then the five tints with the hours a week where one ends and the next begins written
 * under the joins, so the darkest is "over" the last edge and each cell can be read against it.
 */
export function CalendarRampKey({ edges }: { edges: readonly number[] }) {
  return (
    <div
      className="calendar-ramp"
      role="group"
      aria-label="Hours a week"
      data-testid="calendar-ramp"
    >
      <span className="calendar-ramp__none">
        <span className="calendar-ramp__swatch" data-step={0} aria-hidden="true" />
        None
      </span>
      <span className="calendar-ramp__scale">
        <span className="calendar-ramp__steps" aria-hidden="true">
          {Array.from({ length: RAMP_STEPS }, (_, i) => (
            <span key={i} className="calendar-ramp__swatch" data-step={i + 1} />
          ))}
        </span>
        {edges.map((hours, i) => (
          <span
            key={hours}
            className="calendar-ramp__edge"
            data-testid="calendar-ramp-edge"
            data-edge={i + 1}
          >
            {edgeText(hours)}
          </span>
        ))}
      </span>
      <span>h a week</span>
    </div>
  )
}
