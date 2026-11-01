import { RAMP_STEPS } from './calendarRamp'

/** The legend of the ramp: none, then the five tints up to the hours a week at which the darkest begins. */
export function CalendarRampKey({ ceiling }: { ceiling: number }) {
  return (
    <div className="calendar-ramp" data-testid="calendar-ramp">
      <span className="calendar-ramp__swatch" data-step={0} aria-hidden="true" />
      <span>None</span>
      <span className="calendar-ramp__steps" aria-hidden="true">
        {Array.from({ length: RAMP_STEPS }, (_, i) => (
          <span key={i} className="calendar-ramp__swatch" data-step={i + 1} />
        ))}
      </span>
      <span>{ceiling}+ h a week</span>
    </div>
  )
}
