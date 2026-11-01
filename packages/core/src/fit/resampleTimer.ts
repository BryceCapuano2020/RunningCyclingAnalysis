import type { RawTimerEvent } from './resample'

/** Pauses the recorder's own timer events mark, as the seconds of the grid they cover. */
export function markTimerPauses(
  recorded: Uint8Array,
  startMs: number,
  events: RawTimerEvent[],
): Uint8Array {
  const paused = new Uint8Array(recorded.length)
  const indexAt = (tMs: number) => Math.round((tMs - startMs) / 1000)
  const ordered = events.filter((event) => Number.isFinite(event.tMs)).sort((a, b) => a.tMs - b.tMs)
  let pauseStart: number | null = null
  for (const event of ordered) {
    const eventType = normalizeTimerEventType(event.eventType)
    if (!eventType) continue
    if (isTimerStop(eventType)) {
      if (pauseStart === null) pauseStart = indexAt(event.tMs)
    } else if (isTimerStart(eventType) && pauseStart !== null) {
      fillRange(paused, pauseStart, indexAt(event.tMs))
      pauseStart = null
    }
  }
  // A stop with no later start lasts only until records resume, so later data is not lost.
  if (pauseStart !== null) {
    fillRange(paused, pauseStart, nextRecordedIndex(recorded, pauseStart + 1))
  }
  return paused
}

/** Sets [from, to) to 1, clipped to the grid. */
function fillRange(values: Uint8Array, from: number, to: number): void {
  const start = Math.max(0, from)
  const end = Math.min(values.length, to)
  if (end > start) values.fill(1, start, end)
}

/** Index of the first recorded second at or after `from`, or the grid length if there is none. */
function nextRecordedIndex(recorded: Uint8Array, from: number): number {
  for (let i = Math.max(0, from); i < recorded.length; i++) {
    if (recorded[i] === 1) return i
  }
  return recorded.length
}

type TimerEventType = 'start' | 'stop' | 'stopAll' | 'stopDisable' | 'stopDisableAll'

export function normalizeTimerEventType(eventType: string | number): TimerEventType | null {
  if (
    eventType === 'start' ||
    eventType === 'stop' ||
    eventType === 'stopAll' ||
    eventType === 'stopDisable' ||
    eventType === 'stopDisableAll'
  ) {
    return eventType
  }
  if (eventType === 0) return 'start'
  if (eventType === 1) return 'stop'
  if (eventType === 4) return 'stopAll'
  if (eventType === 8) return 'stopDisable'
  if (eventType === 9) return 'stopDisableAll'
  return null
}

function isTimerStop(eventType: TimerEventType): boolean {
  return (
    eventType === 'stop' ||
    eventType === 'stopAll' ||
    eventType === 'stopDisable' ||
    eventType === 'stopDisableAll'
  )
}

function isTimerStart(eventType: TimerEventType): boolean {
  return eventType === 'start'
}
