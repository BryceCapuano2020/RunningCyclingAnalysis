import { runVo2PerMin, shareOfVo2max } from '../threshold/durationTables'

/*
 * Daniels and Gilbert's running formulas (Oxygen Power, 1979), the basis of the VDOT tables: the
 * oxygen cost of running at a speed, and the share of VO2max a runner can hold for a time. The formulas and their coefficients are
 * the threshold's (`threshold/constants.ts`, `threshold/durationTables.ts`); the race predictions read them from there.
 */

/** Oxygen cost, ml/kg/min, of running on the flat at speedMPerMin. */
export const oxygenCost = runVo2PerMin

/** The share of VO2max a runner can hold for a race of minutes. */
export const sustainableShare = shareOfVo2max

/** VDOT: the VO2max a race time implies, ml/kg/min. */
export function vdotOf(distanceM: number, seconds: number): number {
  const minutes = seconds / 60
  return oxygenCost(distanceM / minutes) / sustainableShare(minutes)
}

/**
 * The time, s, a runner of the given VO2max is predicted to run distanceM in: where the race's oxygen
 * cost meets the share of VO2max held for its length. vdotOf falls as time grows, so bisection finds it.
 */
export function danielsTime(distanceM: number, vo2max: number): number {
  let fast = 60
  let slow = 12 * 3600
  for (let i = 0; i < 60; i++) {
    const seconds = (fast + slow) / 2
    if (vdotOf(distanceM, seconds) > vo2max) fast = seconds
    else slow = seconds
  }
  return (fast + slow) / 2
}
