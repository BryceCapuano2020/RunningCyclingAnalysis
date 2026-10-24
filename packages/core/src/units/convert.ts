export const KG_PER_LB = 0.45359237
export const METRES_PER_KM = 1000
export const METRES_PER_MILE = 1609.344
export const METRES_PER_FOOT = 0.3048

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}
