import type { DecodedEvent, DecodedLap, DecodedRecord, DecodedSession } from './protocol/decode'
import type { PipelineUnit } from '../import/pipeline'
import type { RawTimerEvent } from './resample'

const OVERLAP = 'Sessions overlap; times were adjusted'

/** A decoded record with its epoch time. */
export interface Timed {
  tMs: number
  record: DecodedRecord
}

/** The records and timer events that belong to one session, or to the whole file without sessions. */
export interface Unit {
  session: DecodedSession | undefined
  /** Sorted by time. */
  records: Timed[]
  events: RawTimerEvent[]
  laps: DecodedLap[]
}

/**
 * Splits the file into units. With several sessions each record and timer event goes to exactly
 * one session: the latest-starting window that contains it. Overlapping windows are reported.
 */
export function assignUnits(
  sessions: DecodedSession[],
  timed: Timed[],
  events: DecodedEvent[],
  laps: DecodedLap[],
  skipped: string[],
): Unit[] {
  const timerEvents = timerEventsOf(events)
  if (sessions.length === 0) {
    return [{ session: undefined, records: timed, events: timerEvents, laps }]
  }

  const units: Unit[] = sessions.map((session) => ({ session, records: [], events: [], laps: [] }))
  const windows = sessionWindows(sessions)
  if (overlaps(windows)) skipped.push(OVERLAP)
  if (sessions.length === 1) {
    units[0]!.records = timed
  } else {
    const owners = ownersOf(
      windows,
      timed.map((t) => t.tMs),
    )
    timed.forEach((t, k) => {
      const owner = owners[k]!
      if (owner >= 0) units[owner]!.records.push(t)
    })
  }
  // A timer event outside every session window belongs to no unit, whether the file has one session
  // or several: the window decides which events shape a unit's paused time.
  const eventOwners = ownersOf(
    windows,
    timerEvents.map((e) => e.tMs),
  )
  timerEvents.forEach((event, k) => {
    const owner = eventOwners[k]!
    if (owner >= 0) units[owner]!.events.push(event)
  })
  // A lap goes to the session whose window holds its start; one lap of a single session is kept whole.
  const lapStarts = laps.map(
    (lap) => lap.startTimeMs ?? lap.timestampMs ?? Number.NEGATIVE_INFINITY,
  )
  const lapOwners = sessions.length === 1 ? laps.map(() => 0) : ownersOf(windows, lapStarts)
  laps.forEach((lap, k) => {
    const owner = lapOwners[k]!
    if (owner >= 0) units[owner]!.laps.push(lap)
  })
  return units
}

/** The laps with a known start and end, in epoch milliseconds, sorted by start. */
export function lapBounds(laps: DecodedLap[]): NonNullable<PipelineUnit['laps']> {
  const out: NonNullable<PipelineUnit['laps']> = []
  for (const lap of laps) {
    const endMs = lap.timestampMs
    const startMs =
      lap.startTimeMs ??
      (endMs === undefined || lap.totalElapsedTime === undefined
        ? undefined
        : endMs - lap.totalElapsedTime * 1000)
    const resolvedEnd =
      endMs ??
      (startMs === undefined || lap.totalElapsedTime === undefined
        ? undefined
        : startMs + lap.totalElapsedTime * 1000)
    if (startMs === undefined || resolvedEnd === undefined || resolvedEnd <= startMs) continue
    out.push({ startMs, endMs: resolvedEnd })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

function timerEventsOf(events: DecodedEvent[]): RawTimerEvent[] {
  const out: RawTimerEvent[] = []
  for (const event of events) {
    if (
      event.event === 'timer' &&
      event.timestampMs !== undefined &&
      event.eventType !== undefined
    ) {
      out.push({ tMs: event.timestampMs, eventType: event.eventType })
    }
  }
  return out.sort((a, b) => a.tMs - b.tMs)
}

/** A session's window: [start, start + elapsed]. Sessions without a start have none. */
interface Window {
  index: number
  start: number
  end: number
}

/** Session windows sorted by start. */
function sessionWindows(sessions: DecodedSession[]): Window[] {
  const windows: Window[] = []
  sessions.forEach((session, index) => {
    const start = session.startTimeMs
    if (start === undefined) return
    windows.push({ index, start, end: start + (session.totalElapsedTime ?? 0) * 1000 })
  })
  return windows.sort((a, b) => a.start - b.start)
}

/**
 * Sorted windows overlap exactly when some window starts before its predecessor ends, so checking
 * neighbours is enough.
 */
function overlaps(windows: Window[]): boolean {
  return windows.some((window, k) => k > 0 && window.start < windows[k - 1]!.end)
}

/**
 * For each time, the session index of the latest-starting window that contains it, or -1. Times
 * are visited in order while the windows open and close, so the cost is O(n log n + windows).
 */
function ownersOf(windows: Window[], times: number[]): number[] {
  const owners = new Array<number>(times.length).fill(-1)
  const order = times.map((_, i) => i).sort((a, b) => times[a]! - times[b]!)
  // Windows opened so far, in start order. The top is the latest start among those still open.
  const open: Window[] = []
  let next = 0
  for (const i of order) {
    const t = times[i]!
    while (next < windows.length && windows[next]!.start <= t) open.push(windows[next++]!)
    while (open.length > 0 && open[open.length - 1]!.end < t) open.pop()
    const top = open[open.length - 1]
    if (top !== undefined) owners[i] = top.index
  }
  return owners
}
