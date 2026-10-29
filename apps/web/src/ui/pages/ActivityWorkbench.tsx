import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import type { ZoneSet } from '@rca/core/zones'
import type { ActivityTraceReply } from '../../worker/protocol'
import { ActivityZoneTime } from './ActivityZoneTime'
import { LapChoices } from './ActivityWorkbenchLaps'
import { ActivityWorkbenchStack } from './ActivityWorkbenchStack'
import { RepFadeTable } from './ActivityWorkbenchReps'
import { SelectionStats } from './ActivityWorkbenchStats'
import { TimeSelection } from './ActivityWorkbenchTime'
import { colourOf, overviewOf } from './workbenchChannels'
import { DEFAULT_METRICS, METRIC_ORDER, metricLabel, metricUnit } from './workbenchFormat'
import { clampSelection } from './workbenchTime'
import type { Selection } from './workbenchTime'
import './ActivityWorkbench.css'

export interface ActivityWorkbenchProps {
  activityId: string
  units: UnitSystem
  /** A trainer ride or a treadmill run: a speed is the athlete's there, so reps are read by it without power. */
  indoor?: boolean
  loadTrace: (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply>
  /** The zones in effect on the activity's date, for its time in zones. Absent: no zones section. */
  zoneSets?: readonly ZoneSet[]
  /** Whether the activity's heart rate is set aside, which its zones say instead of reading it. */
  heartRateSetAside?: boolean
  /**
   * Told the trace once it is read, and null when there is none, with whether the loading has settled
   * (it has either read a trace or found there is none), so the page can use its laps beside it.
   */
  onTrace?: (trace: ActivityTrace | null, settled: boolean) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; trace: ActivityTrace }
  | { status: 'originalAvailable' }
  | { status: 'missing' }
  | { status: 'original'; trace: ActivityTrace }
  | { status: 'failed' }

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
export function ActivityWorkbench({
  activityId,
  units,
  indoor = false,
  loadTrace,
  zoneSets,
  heartRateSetAside,
  onTrace = noTrace,
}: ActivityWorkbenchProps) {
  return (
    <ActivityWorkbenchSession
      key={activityId}
      activityId={activityId}
      units={units}
      indoor={indoor}
      loadTrace={loadTrace}
      zoneSets={zoneSets}
      heartRateSetAside={heartRateSetAside}
      onTrace={onTrace}
    />
  )
}

function noTrace() {}

const HEADING_ID = 'activity-workbench-heading'

/** The section every state sits in, named by what the athlete is looking at. */
function WorkbenchSection({ sport, children }: { sport?: string; children: ReactNode }) {
  return (
    <section className="section activity-workbench" data-sport={sport} aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID}>In detail</h2>
      {children}
    </section>
  )
}

/** What an activity says when this browser holds no recording of it and keeps no original file. */
const MISSING_DETAIL =
  "This browser has no detailed readings for this activity, and no original file is saved. Add this activity's file again to see its detail. Recordings are kept in limited browser space, and those of the oldest activities are dropped first when it is used up."

function ActivityWorkbenchSession({
  activityId,
  units,
  indoor,
  loadTrace,
  zoneSets,
  heartRateSetAside,
  onTrace,
}: Required<Omit<ActivityWorkbenchProps, 'zoneSets' | 'heartRateSetAside'>> &
  Pick<ActivityWorkbenchProps, 'zoneSets' | 'heartRateSetAside'>) {
  const loaded = useTrace(activityId, loadTrace)
  const { status } = loaded.state
  const trace =
    loaded.state.status === 'ready' || loaded.state.status === 'original'
      ? loaded.state.trace
      : null
  const settled = status !== 'loading'
  useEffect(() => {
    onTrace(trace, settled)
    return () => onTrace(null, false)
  }, [trace, settled, onTrace])
  if (status === 'ready' || status === 'original') {
    return (
      <ReadyWorkbench
        key={loaded.requestKey}
        trace={loaded.state.trace}
        units={units}
        indoor={indoor}
        zoneSets={zoneSets}
        heartRateSetAside={heartRateSetAside}
        fromOriginal={status === 'original'}
      />
    )
  }
  if (status === 'loading') {
    return (
      <WorkbenchSection>
        <p className="secondary" role="status">
          Loading recorded details.
        </p>
      </WorkbenchSection>
    )
  }
  return (
    <WorkbenchSection>
      <p className="secondary" role={status === 'failed' ? 'alert' : 'status'}>
        {status === 'failed'
          ? 'The recorded details could not be loaded.'
          : status === 'originalAvailable'
            ? 'This browser has no detailed readings for this activity. They can be read from the saved original file.'
            : MISSING_DETAIL}
      </p>
      {status === 'failed' && (
        <div className="activity-workbench__actions">
          <button className="btn" type="button" onClick={loaded.retry}>
            Try again
          </button>
        </div>
      )}
      {status === 'originalAvailable' && (
        <div className="activity-workbench__actions">
          <button className="btn" type="button" onClick={loaded.readOriginal}>
            Read original file
          </button>
        </div>
      )}
    </WorkbenchSection>
  )
}

function ReadyWorkbench({
  trace,
  units,
  indoor,
  zoneSets,
  heartRateSetAside,
  fromOriginal,
}: {
  trace: ActivityTrace
  units: UnitSystem
  indoor: boolean
  zoneSets?: readonly ZoneSet[]
  heartRateSetAside?: boolean
  fromOriginal: boolean
}) {
  const available = useMemo(
    () => METRIC_ORDER.filter((metric) => channelAvailable(trace, metric)),
    [trace],
  )
  const max = Math.floor(trace.durationS)
  const [visible, setVisible] = useState<TraceMetric[]>(() =>
    available.filter((metric) => DEFAULT_METRICS.includes(metric)),
  )
  const [chosen, setChosen] = useState<Selection>({ startS: 0, endS: max })
  const overview = useMemo(() => (max < 1 ? null : overviewOf(trace, max)), [trace, max])

  const selection = clampSelection(chosen, max)
  // The brush and the lap strip follow the pointer at once; the stack, the figures and the zones, which
  // read the whole interval, catch up when the pointer pauses, so dragging across a long ride stays smooth.
  const startS = useDeferredValue(selection.startS)
  const endS = useDeferredValue(selection.endS)

  // An empty recording has no seconds to select, so none of the selection is drawn.
  if (max < 1)
    return (
      <WorkbenchSection sport={trace.sport}>
        <p className="secondary">No detailed measures were recorded for this activity.</p>
      </WorkbenchSection>
    )

  return (
    <WorkbenchSection sport={trace.sport}>
      <p className="muted">
        Detailed readings stay on this device.
        {fromOriginal && ' Read from the original file.'}
      </p>
      <MetricControls
        trace={trace}
        units={units}
        available={available}
        visible={visible}
        onChange={setVisible}
      />
      <LapChoices trace={trace} max={max} selection={selection} onSelect={setChosen} />
      {visible.length > 0 ? (
        <ActivityWorkbenchStack
          trace={trace}
          units={units}
          metrics={visible}
          startS={startS}
          endS={endS}
        />
      ) : (
        <p className="secondary">Choose a measure to see it over time.</p>
      )}
      <TimeSelection max={max} selection={selection} overview={overview} onChange={setChosen} />
      <RepFadeTable
        trace={trace}
        units={units}
        indoor={indoor}
        selection={selection}
        onSelect={setChosen}
      />
      <SelectionStats trace={trace} startS={startS} endS={endS} units={units} metrics={visible} />
      {zoneSets && (
        <ActivityZoneTime
          trace={trace}
          sets={zoneSets}
          heartRateSetAside={heartRateSetAside}
          startS={startS}
          endS={endS}
          units={units}
        />
      )}
    </WorkbenchSection>
  )
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
      <legend>Measures shown</legend>
      {available.map((metric) => (
        <label key={metric} className={`metric-chip ts-ch ts-ch--${colourOf(metric)}`}>
          <input
            type="checkbox"
            className="metric-chip__input"
            checked={visible.includes(metric)}
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
        </label>
      ))}
      {visible.includes('cadence') && trace.cadenceUnit === 'unknown' && (
        <p className="muted">This file does not say whether cadence counts steps or revolutions.</p>
      )}
    </fieldset>
  )
}
