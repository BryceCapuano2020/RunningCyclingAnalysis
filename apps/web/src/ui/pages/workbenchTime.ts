const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/

/**
 * A time typed as m:ss, h:mm:ss or plain seconds, in whole seconds. Null for anything else, such as
 * an empty field, a minute past 59 beside an hour, or a decimal.
 */
export function parseClockTime(text: string): number | null {
  const value = text.trim()
  if (/^\d{1,6}$/.test(value)) return Number(value)
  const match = CLOCK.exec(value)
  if (match === null) return null
  const [, hours, minutes = '0', seconds = '0'] = match
  if (Number(seconds) > 59 || (hours !== undefined && Number(minutes) > 59)) return null
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)
}

/** The selected interval in whole seconds: it starts before it ends and both sit inside the activity. */
export interface Selection {
  startS: number
  endS: number
}

/** A selection pulled inside an activity of `max` whole seconds, at least a second long. */
export function clampSelection(selection: Selection, max: number): Selection {
  // A value that is not a number (a bad address, a failed measure) falls back to the whole activity's end.
  const from = Number.isFinite(selection.startS) ? Math.round(selection.startS) : 0
  const to = Number.isFinite(selection.endS) ? Math.round(selection.endS) : max
  const startS = Math.max(0, Math.min(from, max - 1))
  const endS = Math.max(startS + 1, Math.min(to, max))
  return { startS, endS }
}
