import { DAILY_LIMITS } from '@rca/contract'
import type { DailyLimitAction } from '@rca/contract'

/** The noun each daily limit is named by in every message, whichever screen shows it. */
const NOUNS: Record<DailyLimitAction, string> = {
  activityCreate: 'saves',
  fileUpload: 'uploads',
  fileDownload: 'downloads',
  read: 'library loads',
  activityDelete: 'deletions',
  profileWrite: 'profile changes',
}

const LOCAL_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The first instant of the UTC day after the one that contains nowMs. */
function nextUtcMidnight(nowMs: number): number {
  const now = new Date(nowMs)
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

/**
 * The one sentence that says when daily limits reset. The UTC time is the rule; the local time
 * tells the viewer when that is. Pass the server's reset time when there is one.
 */
export function resetSentence(resetsAtMs: number | null = null, nowMs = Date.now()): string {
  const resetsAt = resetsAtMs ?? nextUtcMidnight(nowMs)
  return `It resets at 00:00 UTC (${LOCAL_TIME.format(resetsAt)} your time).`
}

/** The sentence for a daily limit that has been reached, naming the limit by its one noun. */
export function limitReached(
  action: DailyLimitAction,
  resetsAtMs: number | null = null,
  nowMs = Date.now(),
): string {
  return `You have reached today's limit on ${NOUNS[action]} (${DAILY_LIMITS[action]} per day). ${resetSentence(resetsAtMs, nowMs)}`
}
