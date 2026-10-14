/** Ground-truth parameters of a simulated athlete. Generated data must let these be recovered. */
export interface SyntheticAthlete {
  /** Body mass, kg. */
  massKg: number
  /** Bike plus kit mass, kg. */
  bikeMassKg: number
  /** True cycling gross efficiency. */
  grossEfficiency: number
  /** True multiplier on the Minetti running cost. */
  runEconomyScale: number
  /** Critical gross metabolic power running, W/kg. */
  cpRun: number
  /** Critical gross metabolic power riding, W/kg. */
  cpRide: number
  /** Work capacity above critical power, J/kg (metabolic). */
  wPrime: number
  /** Heart rate at zero metabolic power, bpm. */
  hrIntercept: number
  /** Heart rate per W/kg of gross metabolic power, bpm. */
  hrSlope: number
  /** Drag area, m^2. */
  cda: number
  /** Rolling resistance coefficient. */
  crr: number
}

export const DEFAULT_ATHLETE: SyntheticAthlete = {
  massKg: 75,
  bikeMassKg: 9,
  grossEfficiency: 0.205,
  runEconomyScale: 1.03,
  cpRun: 16.5,
  cpRide: 15.0,
  wPrime: 1200,
  hrIntercept: 55,
  hrSlope: 7,
  cda: 0.32,
  crr: 0.005,
}
