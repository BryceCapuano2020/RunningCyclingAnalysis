import { useEffect, useState } from 'react'
import type { ActivityTrace } from '@rca/core/workbench'
import { hasRecordedLaps } from './components/lapRows'
import type { SplitsViewName } from './components/splitRows'

/** How long the page waits for the recorded detail before it chooses the view the splits open on, ms. */
export const SETTLE_MS = 1500

/** What the page knows of the recorded detail: its trace once read, and whether it has stopped loading. */
export interface TraceReport {
  trace: ActivityTrace | null
  /** The detail has loaded, or has been found missing or failed, so no trace is still on its way. */
  settled: boolean
}

/** The report of a page with no detail to read: nothing is on its way. */
export const NO_DETAIL: TraceReport = { trace: null, settled: true }

/** The report of a page whose detail has not yet said anything. */
export const AWAITED: TraceReport = { trace: null, settled: false }

export interface SplitsView {
  /** The view that is open. Laps only when the device recorded laps worth reading as splits. */
  view: SplitsViewName
  choose: (view: SplitsViewName) => void
}

interface ForActivity {
  id: string
  view: SplitsViewName
}

/** The value if it belongs to this activity, so one activity's choice never carries to the next. */
function forThis(value: ForActivity | null, id: string | null): SplitsViewName | null {
  return value !== null && value.id === id ? value.view : null
}

/**
 * Which view of a run's splits is open. It opens on the units while the recorded detail loads, and
 * then on the laps if the device recorded laps worth reading, once the detail has settled or after
 * SETTLE_MS, whichever comes first. After that it never changes by itself: a trace that arrives late,
 * or is read from the original file, only offers the laps, and the athlete's own choice always wins.
 * A null id asks for nothing.
 */
export function useSplitsView(activityId: string | null, report: TraceReport): SplitsView {
  const [chosen, setChosen] = useState<ForActivity | null>(null)
  const [opened, setOpened] = useState<ForActivity | null>(null)
  const [waited, setWaited] = useState<string | null>(null)
  useEffect(() => {
    if (activityId === null) return
    const timer = setTimeout(() => setWaited(activityId), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [activityId])
  const lapsOffered = hasRecordedLaps(report.trace)
  const ready = activityId !== null && (report.settled || waited === activityId)
  const decided = forThis(opened, activityId) ?? (ready ? (lapsOffered ? 'laps' : 'units') : null)
  // The first decision is kept, so a later change in the detail does not move the view under the athlete.
  // It is stored while rendering, which React allows for state that follows what the component was given.
  if (activityId !== null && decided !== null && forThis(opened, activityId) === null) {
    setOpened({ id: activityId, view: decided })
  }
  const wanted = forThis(chosen, activityId) ?? decided ?? 'units'
  return {
    view: wanted === 'laps' && !lapsOffered ? 'units' : wanted,
    choose: (view) => {
      if (activityId !== null) setChosen({ id: activityId, view })
    },
  }
}
