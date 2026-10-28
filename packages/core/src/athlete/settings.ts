import type { Measurement } from './measurements'

export interface AthleteSettings {
  /**
   * Body mass, kg. It is the mass today, and the mass of any activity no dated mass reaches: with no
   * dated masses every activity is priced at it.
   */
  massKg: number
  /** Bike plus kit mass, kg. */
  bikeMassKg: number
  /** The athlete's dated settings. Absent or empty: every activity uses massKg, and references are estimated. */
  measurements?: readonly Measurement[]
}
