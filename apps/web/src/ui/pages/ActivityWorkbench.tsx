import { useEffect, useState } from 'react'
import type { ActivityLap, ActivityTrace, TraceMetric } from '@rca/core/workbench'
import { detectIntervals } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatTotalTime } from '@rca/core/units'
import type { ActivityTraceReply } from '../../worker/workbench'
import { ActivityWorkbenchPlot } from './ActivityWorkbenchPlot'
import { metricLabel, metricUnit } from './workbenchFormat'
import { SelectionStats } from './ActivityWorkbenchStats'
import './ActivityWorkbench.css'

export interface ActivityWorkbenchProps {
  activityId: string
  units: UnitSystem
  loadTrace: (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply>
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; trace: ActivityTrace }
  | { status: 'originalAvailable' }
  | { status: 'missing' }
  | { status: 'original'; trace: ActivityTrace }
  | { status: 'failed' }

const METRIC_ORDER: TraceMetric[] = [
  'speed',
  'power',
  'heartRate',
  'cadence',
  'altitude',
  'temperature',
]

function channelAvailable(trace: ActivityTrace, metric: TraceMetric): boolean {
  const stream = trace.streams[metric]
  return stream !== undefined && stream.some(Number.isFinite)
}

function useTrace(activityId: string, loadTrace: ActivityWorkbenchProps['loadTrace']) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [request, setRequest] = useState({ id: activityId, attempt: 0, fromOriginal: false })

  useEffect(() => {
    let current = true
    void loadTrace(request.id, request.fromOriginal)
      .then((reply) => {
        if (!current) return
        if (reply.kind === 'trace')
          setState({ status: request.fromOriginal ? 'original' : 'ready', trace: reply.trace })
        else if (reply.kind === 'original' && !request.fromOriginal)
          setState({ status: 'originalAvailable' })
        else if (reply.kind === 'original') setState({ status: 'failed' })
        else if (reply.kind === 'missing') setState({ status: 'missing' })
        else setState({ status: 'failed' })
      })
      .catch(() => {
        if (current) setState({ status: 'failed' })
      })
    return () => {
      current = false
    }
  }, [request, loadTrace])

  return {
    state,
    retry: () => {
      setState({ status: 'loading' })
      setRequest((value) => ({ ...value, attempt: value.attempt + 1 }))
    },
    readOriginal: () => {
      setState({ status: 'loading' })
      setRequest((value) => ({ ...value, fromOriginal: true }))
    },
    requestKey: `${request.attempt}:${request.fromOriginal}`,
  }
}

/** One activity's recorded signals over a shared elapsed-time axis. */
export function ActivityWorkbench({ activityId, units, loadTrace }: ActivityWorkbenchProps) {
  return (
    <ActivityWorkbenchSession
      key={activityId}
      activityId={activityId}
      units={units}
      loadTrace={loadTrace}
    />
  )
}

function ActivityWorkbenchSession({ activityId, units, loadTrace }: ActivityWorkbenchProps) {
  const loaded = useTrace(activityId, loadTrace)
  const trace =
    loaded.state.status === 'ready' || loaded.state.status === 'original'
      ? loaded.state.trace
      : null
  if (loaded.state.status === 'loading') {
    return (
      <section className="section activity-workbench" aria-labelledby="activity-workbench-heading">
        <h2 id="activity-workbench-heading">Activity workbench</h2>
        <p className="secondary" role="status">
          Loading recorded details.
        </p>
      </section>
    )
  }
  if (!trace) {
    const failed = loaded.state.status === 'failed'
    const originalAvailable = loaded.state.status === 'originalAvailable'
    return (
      <section className="section activity-workbench" aria-labelledby="activity-workbench-heading">
        <h2 id="activity-workbench-heading">Activity workbench</h2>
        <p className="secondary" role={failed ? 'alert' : 'status'}>
          {failed
            ? 'The activity details could not be loaded. Try again.'
            : originalAvailable
              ? 'Detailed readings are not cached on this device. The saved original can be read on request.'
              : 'Detailed readings are not cached on this device, and no original file is available. Re-add the source file to rebuild them.'}
        </p>
        <p className="muted">Detailed readings stay on this device.</p>
        <div className="activity-workbench__actions">
          {failed ? (
            <button className="btn" type="button" onClick={loaded.retry}>
              Try again
            </button>
          ) : (
            originalAvailable && (
              <button className="btn" type="button" onClick={loaded.readOriginal}>
                Read original file
              </button>
            )
          )}
        </div>
      </section>
    )
  }

  return (
    <ReadyWorkbench
      key={loaded.requestKey}
      trace={trace}
      units={units}
      fromOriginal={loaded.state.status === 'original'}
    />
  )
}

function ReadyWorkbench({
  trace,
  units,
  fromOriginal,
}: {
  trace: ActivityTrace
  units: UnitSystem
  fromOriginal: boolean
}) {
  const available = METRIC_ORDER.filter((metric) => channelAvailable(trace, metric))
  const [visible, setVisible] = useState<TraceMetric[]>(available)
  const [startS, setStartS] = useState(0)
  const [endS, setEndS] = useState(Math.max(1, trace.durationS))

  return (
    <section
      className="section activity-workbench"
      data-sport={trace.sport}
      aria-labelledby="activity-workbench-heading"
    >
      <h2 id="activity-workbench-heading">Activity workbench</h2>
      <p className="muted">Detailed readings stay on this device.</p>
      {fromOriginal && <p className="muted">Read from the original file.</p>}
      <TimeSelection
        trace={trace}
        startS={startS}
        endS={endS}
        onStart={setStartS}
        onEnd={setEndS}
      />
      <MetricControls
        trace={trace}
        units={units}
        available={available}
        visible={visible}
        onChange={setVisible}
      />
      <LapChoices
        trace={trace}
        startS={startS}
        endS={endS}
        onSelect={(lap) => {
          setStartS(lap.startS)
          setEndS(lap.endS)
        }}
      />
      {visible.length > 0 ? (
        <div className="activity-workbench__plots">
          {visible.map((metric) => (
            <ActivityWorkbenchPlot
              key={metric}
              trace={trace}
              metric={metric}
              units={units}
              startS={startS}
              endS={endS}
            />
          ))}
        </div>
      ) : (
        <p className="secondary">Choose a recorded measure to show its timeline.</p>
      )}
      <SelectionStats trace={trace} startS={startS} endS={endS} units={units} />
      <p className="muted">
        Times are elapsed seconds from the start. Each measure uses the same selected interval.
      </p>
    </section>
  )
}

function TimeSelection({
  trace,
  startS,
  endS,
  onStart,
  onEnd,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  onStart: (value: number) => void
  onEnd: (value: number) => void
}) {
  const max = Math.max(1, Math.floor(trace.durationS))
  const start = Math.max(0, Math.min(startS, max - 1))
  const end = Math.max(start + 1, Math.min(endS, max))
  const setStart = (value: number) => onStart(integerInBounds(value, 0, end - 1, start))
  const setEnd = (value: number) => onEnd(integerInBounds(value, start + 1, max, end))
  return (
    <fieldset className="activity-workbench__selection">
      <legend>Selected interval</legend>
      <div className="activity-workbench__range">
        <label>
          Start time
          <span className="activity-workbench__input-row">
            <input
              type="range"
              min={0}
              max={max - 1}
              value={start}
              aria-label="Selected interval start time"
              onChange={(event) => setStart(event.currentTarget.valueAsNumber)}
            />
            <input
              type="number"
              min={0}
              max={end - 1}
              step={1}
              value={start}
              aria-label="Selected interval start time in seconds"
              onChange={(event) => setStart(event.currentTarget.valueAsNumber)}
            />{' '}
            <span>seconds</span>
          </span>
        </label>
        <label>
          End time
          <span className="activity-workbench__input-row">
            <input
              type="range"
              min={start + 1}
              max={max}
              value={end}
              aria-label="Selected interval end time"
              onChange={(event) => setEnd(event.currentTarget.valueAsNumber)}
            />
            <input
              type="number"
              min={start + 1}
              max={max}
              step={1}
              value={end}
              aria-label="Selected interval end time in seconds"
              onChange={(event) => setEnd(event.currentTarget.valueAsNumber)}
            />{' '}
            <span>seconds</span>
          </span>
        </label>
      </div>
      <p className="muted">
        {formatTotalTime(start)}–{formatTotalTime(end)} selected
      </p>
    </fieldset>
  )
}

function integerInBounds(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(Math.round(value), max))
}

function MetricControls({
  trace,
  units,
  available,
  visible,
  onChange,
}: {
  trace: ActivityTrace
  units: UnitSystem
  available: TraceMetric[]
  visible: TraceMetric[]
  onChange: (metrics: TraceMetric[]) => void
}) {
  if (available.length === 0)
    return <p className="secondary">No detailed measures were recorded for this activity.</p>
  return (
    <fieldset className="activity-workbench__metrics">
      <legend>Measures to plot</legend>
      {available.map((metric) => (
        <label key={metric}>
          <input
            type="checkbox"
            checked={visible.includes(metric)}
            onChange={(event) =>
              onChange(
                event.currentTarget.checked
                  ? [...visible, metric]
                  : visible.filter((item) => item !== metric),
              )
            }
          />
          {metricLabel(metric, trace.sport)}{' '}
          <span className="muted">
            ({metricUnit(metric, trace.sport, units, trace.cadenceUnit)})
          </span>
        </label>
      ))}
      {available.includes('cadence') && trace.cadenceUnit === 'unknown' && (
        <p className="muted">The source did not identify cadence units.</p>
      )}
    </fieldset>
  )
}

function LapChoices({
  trace,
  startS,
  endS,
  onSelect,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  onSelect: (lap: ActivityLap) => void
}) {
  const laps = trace.laps.length > 0 ? trace.laps : detectIntervals(trace)
  if (laps.length === 0) return null
  const recorded = trace.laps.length > 0
  return (
    <div className="activity-workbench__laps">
      <h3>{recorded ? 'Recorded laps' : 'Interval suggestions'}</h3>
      {!recorded && (
        <p className="muted">
          These are time ranges from the recording. They are not workout classifications.
        </p>
      )}
      <div className="activity-workbench__lap-buttons">
        {laps.map((lap, index) => {
          const active = startS === lap.startS && endS === lap.endS
          const label = lap.label ?? `${recorded ? 'Lap' : 'Interval'} ${index + 1}`
          return (
            <button
              key={`${lap.startS}-${lap.endS}-${lap.label ?? label}`}
              className={active ? 'btn activity-workbench__lap--active' : 'btn'}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(lap)}
            >
              {label} · {formatTotalTime(lap.endS - lap.startS)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
