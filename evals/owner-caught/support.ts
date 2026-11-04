import { copyOf } from '@rca/core/history/test/balanceLibrary'
import type { YearEffort } from '@rca/core/history/test/balanceLibrary'
import { AnalysisSession } from '@rca/core/session'
import type { PeriodChoice } from '@rca/core/session'
import type { ActivityDigest, AthleteSettings, Sport } from '@rca/core/types'

/** One synthetic athlete's body, the same in every twin, so a figure that moves is the code's doing. */
export const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9, sex: 'male' }
export const PROFILE = { birthYear: 1990, sex: 'male' } as const

export const DAY_MS = 86_400_000
/** The last day of every synthetic library, so a twin is the same on every run. */
export const END_MS = Date.UTC(2025, 9, 1, 12)

export interface Plan {
  /** Whole years the library spans, ending on END_MS. */
  years: number
  /** Days between activities of one sport; the other sport falls half that apart from it. */
  everyDays: number
  /** Each sport's best-effort scale on a day `age` days before END_MS: above 1 is a better best. */
  scale: Record<Sport, (age: number) => YearEffort>
}

/** The same scale on every day: an athlete who neither gains nor loses. */
export const flat =
  (scale: number, heartRate = 175) =>
  () => ({ scale, heartRate })

/** An athlete whose scale moves linearly from `from` (the library's first day) to `to` (its last). */
export function drift(from: number, to: number, years: number) {
  return (age: number) => ({
    scale: to + ((from - to) * age) / (years * 365),
    heartRate: 175,
  })
}

/** A library of copies of one run and one ride, dated through the years, each at the scale its sport has that day. */
export function library(plan: Plan): ActivityDigest[] {
  const out: ActivityDigest[] = []
  const days = plan.years * 365
  for (let age = 0; age < days; age += plan.everyDays) {
    for (const [sport, shift] of [
      ['run', 0],
      ['ride', Math.floor(plan.everyDays / 2)],
    ] as const) {
      const ago = age + shift
      if (ago < days) {
        out.push(copyOf(sport, `${sport}-${ago}`, END_MS - ago * DAY_MS, plan.scale[sport](ago)))
      }
    }
  }
  return out
}

/** The library as a watch with no heart-rate strap records it. */
export function withoutHeartRate(digests: ActivityDigest[]): ActivityDigest[] {
  return digests.map((digest) => ({
    ...digest,
    curve: digest.curve.map((point) => ({ ...point, heartRate: null })),
  }))
}

/** A session holding a library, as the web worker holds the athlete's. */
export function sessionOf(digests: ActivityDigest[]): AnalysisSession {
  const session = new AnalysisSession()
  session.loadDigests(digests, SETTINGS)
  return session
}

/** The analysis the app shows for a period of the library. */
export function resultOf(session: AnalysisSession, choice: PeriodChoice) {
  const result = session.setRange(choice, SETTINGS).result
  if (result === null) throw new Error('the library gave no analysis')
  return result
}

/** The seconds in a printed clock value such as "5:28". */
export function seconds(clock: string): number {
  const [minutes, rest] = clock.split(':').map(Number)
  return minutes! * 60 + rest!
}
