import { HEADLINE_DURATION_S } from '../../constants'
import { digestActivity } from '../../digest/digestActivity'
import type { EffortReference } from '../../effort'
import { DEFAULT_ATHLETE, generateActivity } from '../../synthetic'
import type { ActivitySpec } from '../../synthetic'
import type { ActivityDigest, AthleteSettings, Sport } from '../../types'

export const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

/** A reference heart rate of 190 bpm that can certify an effort: a 20 minute average of 171 or more is hard. */
export const REFERENCE: EffortReference = {
  referenceHr: { run: 190, ride: 190 },
  reading: { run: 'trusted', ride: 'trusted' },
  source: { run: 'entered', ride: 'entered' },
  from: { run: null, ride: null },
}

/** One activity of each sport, digested once: a library of years is copies of these with their own scale and date. */
let templates: Record<Sport, ActivityDigest> | null = null

function templateOf(): Record<Sport, ActivityDigest> {
  const spec = (sport: Sport): ActivitySpec => ({
    id: `template-${sport}`,
    name: `Template ${sport}`,
    sport,
    startMs: Date.UTC(2020, 0, 4, 7),
    durationS: 3600,
    effort: sport === 'run' ? 'intervals' : 'test',
    terrain: 'flat',
    withPower: true,
  })
  templates ??= {
    run: digestActivity(generateActivity(DEFAULT_ATHLETE, spec('run'), 1)),
    ride: digestActivity(generateActivity(DEFAULT_ATHLETE, spec('ride'), 2)),
  }
  return templates
}

/** What one sport did in one year: how its best compares with the template's, and the heart rate over that best. */
export interface YearEffort {
  /** The template's values times this: above 1 is a better best. */
  scale: number
  /** Mean heart rate over the best 20 minutes, bpm. */
  heartRate?: number
}

export interface YearSpec {
  year: number
  run?: YearEffort
  ride?: YearEffort
}

/** One copy of a sport's template, on a day of a year, with its curve scaled and its 20 minute heart rate set. */
export function copyOf(
  sport: Sport,
  id: string,
  startMs: number,
  effort: YearEffort,
): ActivityDigest {
  const source = templateOf()[sport]
  return {
    ...source,
    id,
    name: id,
    startMs,
    curve: source.curve.map((point) =>
      Object.assign({}, point, {
        value: point.value * effort.scale,
        heartRate:
          point.durationS === HEADLINE_DURATION_S && effort.heartRate !== undefined
            ? effort.heartRate
            : point.heartRate,
      }),
    ),
  }
}

/** A synthetic library: for each year, a run and a ride with the given scale, in June, and a second run in July. */
export function balanceLibrary(years: readonly YearSpec[]): ActivityDigest[] {
  return years.flatMap(({ year, run, ride }) => [
    ...(run === undefined
      ? []
      : [
          copyOf('run', `run-${year}`, Date.UTC(year, 5, 10, 12), run),
          copyOf('run', `run-${year}-b`, Date.UTC(year, 6, 20, 12), {
            ...run,
            scale: run.scale * 0.9,
          }),
        ]),
    ...(ride === undefined
      ? []
      : [copyOf('ride', `ride-${year}`, Date.UTC(year, 5, 12, 12), ride)]),
  ])
}

/** Twelve years from 2013: run ahead until 2020, ride from 2021; 2016 has a run only and 2018 nothing at all. */
export const TWELVE_YEARS: readonly YearSpec[] = Array.from({ length: 12 }, (_, i): YearSpec => {
  const year = 2013 + i
  const run = { scale: 1 + i * 0.01, heartRate: 175 }
  const ride = { scale: 0.7 + i * 0.05, heartRate: i % 3 === 0 ? 120 : 175 }
  return { year, run, ride }
})
  .filter(({ year }) => year !== 2018)
  .map((spec) => (spec.year === 2016 ? { year: spec.year, run: spec.run } : spec))

/** Steady runs, three a week from January 2021, at one heart rate: what the fitness dots are drawn from. */
export { steadyLibrary } from '../../fitness/test/runDigest'
