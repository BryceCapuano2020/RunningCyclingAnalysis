import type { Measurement } from './measurements'

export interface AthleteSettings {
  /**
   * Body mass, kg. It is the mass today: the dated mass in effect today when there is one, else the profile's
   * (`bodyMassOn`). With no dated masses every activity is priced at it; with some, each at its own date's
   * (`massAtFor`), and this is the mass that figures expressed at today's weight use.
   */
  massKg: number
  /** Bike plus kit mass, kg. */
  bikeMassKg: number
  /** The athlete's dated settings. Absent or empty: every activity uses massKg, and references are estimated. */
  measurements?: readonly Measurement[]
  /**
   * True while massKg is a placeholder because the athlete has entered no weight: ride power is not judged
   * against it (see implausiblePower). Dated body masses make the weight known whatever this says.
   */
  massAssumed?: true
  /**
   * Ids of the rides whose implausible power the athlete chose to keep (see implausiblePower). Absent or
   * empty: such a ride's power is set aside.
   */
  keepPower?: readonly string[]
  /**
   * The year of birth, when the athlete has given it. The effort gate reads it to judge a heart-rate reference against the
   * age band; absent, the reference is judged on the data alone.
   */
  birthYear?: number
  /**
   * The workouts (by `workoutKey`) the athlete counts as runs although they are at walking pace. Absent or
   * empty: every run at walking pace is left out of the analysis.
   */
  countedRuns?: readonly string[]
}
