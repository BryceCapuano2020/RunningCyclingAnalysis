import { FLAT_RUN_COST, RESTING_W_PER_KG } from '../constants'

/** Gross W/kg for running at a steady speed on the flat. */
export function flatSpeedToMetabolic(speedMs: number, economyScale = 1): number {
  return RESTING_W_PER_KG + economyScale * FLAT_RUN_COST * speedMs
}

/** Flat running speed, m/s, that costs the given gross W/kg. Never negative. */
export function metabolicToFlatSpeed(metabolicWkg: number, economyScale = 1): number {
  return Math.max(0, (metabolicWkg - RESTING_W_PER_KG) / (economyScale * FLAT_RUN_COST))
}

/** Gross W/kg for cycling at a given mechanical power. */
export function ridePowerToMetabolic(
  powerW: number,
  massKg: number,
  grossEfficiency: number,
): number {
  return powerW / (grossEfficiency * massKg)
}

/** Mechanical power, W, that costs the given gross W/kg while cycling. */
export function metabolicToRidePower(
  metabolicWkg: number,
  massKg: number,
  grossEfficiency: number,
): number {
  return metabolicWkg * grossEfficiency * massKg
}
