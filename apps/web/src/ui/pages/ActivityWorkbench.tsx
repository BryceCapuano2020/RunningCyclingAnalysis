import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import type { ActivityTraceReply } from '../../worker/protocol'
import { LapChoices } from './ActivityWorkbenchLaps'
import { ActivityWorkbenchPlot } from './ActivityWorkbenchPlot'
import { SelectionStats } from './ActivityWorkbenchStats'
import { TimeSelection } from './ActivityWorkbenchTime'
import { DEFAULT_METRICS, METRIC_ORDER, metricLabel, metricUnit } from './workbenchFormat'
import { clampSelection } from './workbenchTime'
import type { Selection } from './workbenchTime'
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

function ActivityWorkbenchSession({ activityId, units, loadTrace }: ActivityWorkbenchProps) {
  const loaded = useTrace(activityId, loadTrace)
  const { status } = loaded.state
  if (status === 'ready' || status === 'original') {
    return (
      <ReadyWorkbench
        key={loaded.requestKey}
        trace={loaded.state.trace}
        units={units}
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
            : 'This browser has no detailed readings for this activity and no original file is saved. Re-add the source file to see them.'}
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
  fromOriginal,
}: {
  trace: ActivityTrace
  units: UnitSystem
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

  // An empty recording has no seconds to select, so none of the selection is drawn.
  if (max < 1)
    return (
      <WorkbenchSection sport={trace.sport}>
        <p className="secondary">No detailed measures were recorded for this activity.</p>
      </WorkbenchSection>
    )
  const selection = clampSelection(chosen, max)

  return (
    <WorkbenchSection sport={trace.sport}>
      <p className="muted">
        Detailed readings stay on this device.
        {fromOriginal && ' Read from the original file.'}
      </p>
      <TimeSelection max={max} selection={selection} onChange={setChosen} />
      <MetricControls
        trace={trace}
        units={units}
        available={available}
        visible={visible}
        onChange={setVisible}
      />
      <LapChoices trace={trace} max={max} selection={selection} onSelect={setChosen} />
      {visible.length > 0 ? (
        <div className="activity-workbench__plots">
          {visible.map((metric) => (
            <ActivityWorkbenchPlot
              key={metric}
              trace={trace}
              metric={metric}
              units={units}
              startS={selection.startS}
              endS={selection.endS}
            />
          ))}
        </div>
      ) : (
        <p className="secondary">Choose a measure to see it over time.</p>
      )}
      <SelectionStats trace={trace} startS={selection.startS} endS={selection.endS} units={units} />
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
        <label key={metric}>
          <input
            type="checkbox"
            checked={visible.includes(metric)}
            onChange={(event) => {
              const next = new Set(visible)
              if (event.currentTarget.checked) next.add(metric)
              else next.delete(metric)
              onChange(METRIC_ORDER.filter((item) => next.has(item)))
            }}
          />
          {metricLabel(metric, trace.sport)}{' '}
          <span className="muted">
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
