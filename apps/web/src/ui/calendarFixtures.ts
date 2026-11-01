import { historyOf } from '@rca/core/history'
import type { TrainingCalendar, YearRow } from '@rca/core/history'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { ActivityDigest, Sport } from '@rca/core/types'

const INPUT = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set<string>(),
  nowMs: Date.UTC(2040, 0, 1),
  gate: undefined,
}

/** What a sport did in a week of a synthetic library: its hours, over a count of activities. */
type Did = readonly [hours: number, activities: number]

/** A day of a synthetic library, the year, month (1 to 12) and day, with the hours and count of each sport that trained. */
export interface DaySpec {
  on: readonly [year: number, month: number, day: number]
  run?: Did
  ride?: Did
}

function digestsOf(spec: DaySpec, index: number): ActivityDigest[] {
  const sports: [Sport, Did | undefined][] = [
    ['run', spec.run],
    ['ride', spec.ride],
  ]
  return sports.flatMap(([sport, did]) =>
    did === undefined
      ? []
      : Array.from({ length: did[1] }, (_, n) => {
          const [year, month, day] = spec.on
          return {
            modelRevision: MODEL_REVISION,
            id: `${sport}-${index}-${n}`,
            sport,
            startMs: Date.UTC(year, month - 1, day, 6 + n),
            durationS: (did[0] / did[1]) * 3600,
            distanceM: 10_000,
            elevationGainM: 0,
          } as ActivityDigest
        }),
  )
}

/** The training calendar and the calendar years of a synthetic library, built by the core from the given days. */
export function libraryOf(days: readonly DaySpec[]): {
  calendar: TrainingCalendar
  years: YearRow[]
} {
  const { calendar, years } = historyOf(days.flatMap(digestsOf), INPUT)
  return { calendar, years }
}

/** The training calendar of a synthetic library, built by the core from one activity or more on each given day. */
export const calendarOf = (days: readonly DaySpec[]): TrainingCalendar => libraryOf(days).calendar

/** Five years of both sports with a gap in them: a run every week of 2019 to 2023, a ride in one week of four, and eight weeks of nothing in the third year. */
export function fiveYearLibrary(): { calendar: TrainingCalendar; years: YearRow[] } {
  const days: DaySpec[] = []
  const first = Date.UTC(2019, 0, 7)
  for (let week = 0; week < 5 * 52; week++) {
    const at = new Date(first + week * 7 * 86_400_000)
    const on = [at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()] as const
    // Eight quiet weeks in the middle of the third year.
    if (week >= 2 * 52 + 24 && week < 2 * 52 + 32) continue
    days.push({
      on,
      run: [2 + (week % 5), 1 + (week % 3)],
      ...(week % 4 === 0 ? { ride: [3 + (week % 6), 1] as const } : {}),
    })
  }
  return libraryOf(days)
}
