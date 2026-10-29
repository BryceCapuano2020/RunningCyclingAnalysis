import type { Sport } from '../types'

export type Effort = 'easy' | 'tempo' | 'intervals' | 'test' | 'race'
export type Terrain = 'flat' | 'rolling' | 'climb'

export interface ActivitySpec {
  id: string
  name: string
  sport: Sport
  /** Epoch milliseconds of the first sample. */
  startMs: number
  /** Length of the activity in whole seconds. */
  durationS: number
  effort: Effort
  terrain: Terrain
  /** Rides only. Defaults to true. Ignored for runs, which never carry power. */
  withPower?: boolean
  /** Defaults to true. */
  withHeartRate?: boolean
  /** Adds a 6-minute stretch of implausibly low heart rate readings. Defaults to false. */
  hrGlitch?: boolean
}
