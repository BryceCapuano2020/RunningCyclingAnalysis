import { useDeferredValue, useEffect, useMemo, useState } from 'react'
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
import { DetailNote, WorkbenchSection } from './ActivityWorkbenchSection'
import { MetricControls } from './ActivityWorkbenchMeasures'
import { overviewOf } from './workbenchChannels'
import { DEFAULT_METRICS, METRIC_ORDER } from './workbenchFormat'
import { readableTrace } from './workbenchData'
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
  /**
   * The column beside the timeline, where the page draws the interval's figures from 1100 px. Absent, or
   * on a narrower page, they sit under the timeline.
   */
  selectionHost?: HTMLElement | null
  /** Offers files to the library: the secondary action of an activity whose detail is not kept. */
  onAddFiles?: (files: File[]) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; trace: ActivityTrace }
  | { status: 'originalAvailable' }
  | { status: 'missing' }
  | { status: 'original'; trace: ActivityTrace }
  | { status: 'failed' }

/**
 * What a measure holds: `varies` when it has readings worth a row, `empty` when it has none to draw: every reading
 * missing, a power meter that read zero throughout, or a terrain that never changes height. A measure held at one
 * other value (an ERG ride at 200 W, a stuck cadence sensor) is a finding, so it keeps its row. Null for a measure
 * the file does not have at all.
 */
type ChannelContent = 'varies' | 'empty'

function channelContent(trace: ActivityTrace, metric: TraceMetric): ChannelContent | null {
  const stream = readableTrace(trace).streams[metric]
  if (stream === undefined) return null
  let first = Number.NaN
  let differs = false
  for (const value of stream) {
    if (!Number.isFinite(value)) continue
    if (Number.isNaN(first)) first = value
    else if (value !== first) {
      differs = true
      break
    }
  }
  if (Number.isNaN(first)) return 'empty'
  if (differs) return 'varies'
  // One value throughout: nothing to draw for a flat terrain or a power of zero, and a row for any other.
  return metric === 'altitude' || (metric === 'power' && first === 0) ? 'empty' : 'varies'
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
  selectionHost,
  onAddFiles,
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
      selectionHost={selectionHost}
      onAddFiles={onAddFiles}
    />
  )
}

function noTrace() {}

function ActivityWorkbenchSession({
  activityId,
  units,
  indoor,
  loadTrace,
  zoneSets,
  heartRateSetAside,
  onTrace,
  selectionHost,
  onAddFiles,
}: Required<
  Omit<ActivityWorkbenchProps, 'zoneSets' | 'heartRateSetAside' | 'selectionHost' | 'onAddFiles'>
> &
  Pick<ActivityWorkbenchProps, 'zoneSets' | 'heartRateSetAside' | 'selectionHost' | 'onAddFiles'>) {
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
        selectionHost={selectionHost}
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
    <DetailNote
      status={status}
      onRetry={loaded.retry}
      onReadOriginal={loaded.readOriginal}
      onAddFiles={onAddFiles}
    />
  )
}

function ReadyWorkbench({
  trace,
  units,
  indoor,
  zoneSets,
  heartRateSetAside,
  selectionHost,
  fromOriginal,
}: {
  trace: ActivityTrace
  units: UnitSystem
  indoor: boolean
  zoneSets?: readonly ZoneSet[]
  heartRateSetAside?: boolean
  selectionHost?: HTMLElement | null
  fromOriginal: boolean
}) {
  const content = useMemo(
    () =>
      METRIC_ORDER.flatMap((metric) => {
        const found = channelContent(trace, metric)
        return found === null ? [] : [[metric, found] as const]
      }),
    [trace],
  )
  // A measure with nothing to draw has its chip, which says so, and no row until it has something.
  const available = useMemo(
    () => content.filter(([, found]) => found === 'varies').map(([metric]) => metric),
    [content],
  )
  const empty = useMemo(
    () => content.filter(([, found]) => found === 'empty').map(([metric]) => metric),
    [content],
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

  const whole = selection.startS === 0 && selection.endS === max
  const reset = () => setChosen({ startS: 0, endS: max })
  const timeSelection = (
    <TimeSelection max={max} selection={selection} overview={overview} onChange={setChosen} />
  )

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
      {visible.length > 0 ? (
        <ActivityWorkbenchStack
          trace={trace}
          units={units}
          metrics={visible}
          startS={startS}
          endS={endS}
          onSelect={(from, to) => setChosen({ startS: from, endS: to })}
          zoomed={!whole}
          onReset={reset}
          below={timeSelection}
        />
      ) : (
        <>
          <p className="secondary">Choose a measure to see it over time.</p>
          {timeSelection}
        </>
      )}
      <LapChoices
        trace={trace}
        max={max}
        selection={selection}
        units={units}
        onSelect={setChosen}
      />
      <MetricControls
        trace={trace}
        units={units}
        available={available}
        empty={empty}
        visible={visible}
        onChange={setVisible}
      />
      <RepFadeTable
        trace={trace}
        units={units}
        indoor={indoor}
        selection={selection}
        onSelect={setChosen}
      />
      <SelectionStats
        trace={trace}
        startS={startS}
        endS={endS}
        units={units}
        metrics={visible}
        tilesHost={selectionHost}
      />
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
