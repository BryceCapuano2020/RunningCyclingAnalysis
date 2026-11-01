import { DAILY_LIMITS, LIST_ROWS_LIMIT_MESSAGE, LIST_ROWS_PER_DAY } from '@rca/contract'
import type { DailyLimitAction } from '@rca/contract'
import { formatCount } from './format/count'

/** The noun each daily limit is named by in every message, whichever screen shows it. */
const NOUNS: Record<DailyLimitAction, string> = {
  activityCreate: 'saves',
  fileUpload: 'uploads',
  fileDownload: 'downloads',
  read: 'library loads',
  activityDelete: 'deletions',
  profileWrite: 'profile changes',
  measurementWrite: 'changes to your dated settings',
  measurementRead: 'loads of your dated settings',
}

const LOCAL_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The first instant of the UTC day after the one that contains nowMs. */
function nextUtcMidnight(nowMs: number): number {
  const now = new Date(nowMs)
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

/**
 * The one sentence that says when daily limits reset, in the viewer's local time. The limit is set
 * on UTC days; the reset time is that day's start, shown in the viewer's own clock. Pass the
 * server's reset time when there is one.
 */
export function resetSentence(resetsAtMs: number | null = null, nowMs = Date.now()): string {
  const resetsAt = resetsAtMs ?? nextUtcMidnight(nowMs)
  return `It resets at ${LOCAL_TIME.format(resetsAt)}, your time.`
}

/** The sentence for a daily limit that has been reached, naming the limit by its one noun. */
export function limitReached(
  action: DailyLimitAction,
  resetsAtMs: number | null = null,
  nowMs = Date.now(),
): string {
  return `You have reached today's limit on ${NOUNS[action]} (${formatCount(DAILY_LIMITS[action])} per day). ${resetSentence(resetsAtMs, nowMs)}`
}

/**
 * The sentence for a library listing that the day's row allowance refused part way through, which is
 * a different allowance from the library loads that `limitReached('read')` names. The server marks it
 * with LIST_ROWS_LIMIT_MESSAGE; any other daily-limit refusal of a listing is a library load.
 */
export function listingLimitReached(
  serverMessage: string,
  resetsAtMs: number | null = null,
  nowMs = Date.now(),
): string {
  if (serverMessage !== LIST_ROWS_LIMIT_MESSAGE) return limitReached('read', resetsAtMs, nowMs)
  return `You have reached today's limit on rows listed from your library (${formatCount(LIST_ROWS_PER_DAY)} per day). ${resetSentence(resetsAtMs, nowMs)}`
}
