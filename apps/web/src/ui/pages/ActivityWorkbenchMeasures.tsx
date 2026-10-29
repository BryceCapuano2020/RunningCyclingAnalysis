import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { colourOf } from './workbenchChannels'
import { METRIC_ORDER, metricLabel, metricUnit } from './workbenchFormat'

/**
 * The measures as chips, each in its channel's colour so the choice also keys the rows. A measure the file
 * holds with nothing to draw (all missing, or one value throughout) keeps its chip, off and saying so.
 */
export function MetricControls({
  trace,
  units,
  available,
  empty,
  visible,
  onChange,
}: {
  trace: ActivityTrace
  units: UnitSystem
  available: TraceMetric[]
  /** Measures the file has but with nothing to draw: shown as chips that say so, and not chosen. */
  empty: TraceMetric[]
  visible: TraceMetric[]
  onChange: (metrics: TraceMetric[]) => void
}) {
  if (available.length === 0 && empty.length === 0)
    return <p className="secondary">No detailed measures were recorded for this activity.</p>
  return (
    <fieldset className="activity-workbench__metrics">
      <legend>Measures shown</legend>
      {METRIC_ORDER.filter((metric) => available.includes(metric) || empty.includes(metric)).map(
        (metric) => {
          const none = empty.includes(metric)
          return (
            <label
              key={metric}
              className={`metric-chip ts-ch ts-ch--${colourOf(metric)}${none ? ' metric-chip--empty' : ''}`}
            >
              <input
                type="checkbox"
                className="metric-chip__input"
                disabled={none}
                checked={!none && visible.includes(metric)}
                onChange={(event) => {
                  const next = new Set(visible)
                  if (event.currentTarget.checked) next.add(metric)
                  else next.delete(metric)
                  onChange(METRIC_ORDER.filter((item) => next.has(item)))
                }}
              />
              <span className="metric-chip__box" aria-hidden="true" />
              {metricLabel(metric, trace.sport)}{' '}
              <span className="sr-only">
                ({metricUnit(metric, trace.sport, units, trace.cadenceUnit)})
              </span>
              {none && <span className="metric-chip__note">no data</span>}
            </label>
          )
        },
      )}
      {visible.includes('cadence') && trace.cadenceUnit === 'unknown' && (
        <p className="muted">This file does not say whether cadence counts steps or revolutions.</p>
      )}
    </fieldset>
  )
}
