import { weekEndMs } from '../digest/trendPoints'
import type { Sport } from '../types'
import { perSport } from './constants'
import type { ZoneActivity, ZoneTables, ZoneWeek } from './types'

function weeksOf(activities: readonly ZoneActivity[], sport: Sport): ZoneWeek[] {
  const byWeek = new Map<number, ZoneWeek>()
  for (const a of activities) {
    if (a.sport !== sport) continue
    const endMs = weekEndMs(a.startMs)
    const week = byWeek.get(endMs) ?? { endMs, easyS: 0, middleS: 0, hardS: 0 }
    week.easyS += a.easyS
    week.middleS += a.middleS
    week.hardS += a.hardS
    byWeek.set(endMs, week)
  }
  return [...byWeek.values()].sort((x, y) => x.endMs - y.endMs)
}

/**
 * Zone tables from their activities: the weeks are worked out from them, never carried, so that cutting
 * the activities at a date (mid-week, say) cuts the last week's totals with them and nothing of the
 * activities after the date remains.
 */
export function zoneTablesOf(activities: readonly ZoneActivity[]): ZoneTables {
  return { activities: [...activities], weeks: perSport((sport) => weeksOf(activities, sport)) }
}
