import { DAY_MS } from '@rca/core/constants'
import { endOfLocalDay, windowEnding } from '@rca/core/period'
import type { Period } from '@rca/core/period'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from '../ui/components/fixtures'

/** The day the newest activity of the library started. */
export const WINDOW_NEWEST_MS = Date.UTC(2026, 5, 30, 8)

/**
 * Eight activities on file. The last six weeks hold two runs the analysis counts and one run at walking pace. The
 * five older ones are all counted, so one activity on file is not counted.
 */
export function windowLibrary(): ActivitySummary[] {
  const at = (id: string, daysBack: number, overrides: Partial<ActivitySummary> = {}) =>
    makeActivity({ id, name: id, startMs: WINDOW_NEWEST_MS - daysBack * DAY_MS, ...overrides })
  return [
    at('run-1', 0, { sport: 'run' }),
    at('run-2', 10, { sport: 'run' }),
    at('run-3', 20, { sport: 'run', walkingPace: true }),
    at('ride-1', 60, { sport: 'ride' }),
    at('run-4', 90, { sport: 'run' }),
    at('ride-2', 120, { sport: 'ride' }),
    at('run-5', 150, { sport: 'run' }),
    at('ride-3', 200, { sport: 'ride' }),
  ]
}

/** The oldest activity of the library, in days before the newest. */
const OLDEST_DAYS_BACK = 200

/**
 * The period the session holds over the library: the last `days` days counted back from the newest activity, or all
 * time, from the oldest one the analysis counts to the end of the newest one's day.
 */
export function windowPeriod(choice: number | 'all'): Period {
  if (choice === 'all') {
    return {
      choice,
      startMs: WINDOW_NEWEST_MS - OLDEST_DAYS_BACK * DAY_MS,
      endMs: endOfLocalDay(WINDOW_NEWEST_MS),
      days: null,
      fellBack: false,
    }
  }
  return { choice, ...windowEnding(WINDOW_NEWEST_MS, choice), days: choice, fellBack: false }
}
