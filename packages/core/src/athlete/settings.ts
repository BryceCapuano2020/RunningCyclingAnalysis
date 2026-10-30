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
   * The year of birth, when the athlete has given it. The effort gate reads it to judge a heart-rate reference against the
   * age band; absent, the reference is judged on the data alone.
   */
  birthYear?: number
}
