import { groupThousands, kgToLb } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/**
 * A lifted load with its unit, in the profile's: kilograms to 0.01 and pounds to 0.1, trailing zeros dropped ("62.5 kg",
 * "225 lb"). A barbell moves in small steps, which a whole-number mass would hide. Pounds are the kilograms converted
 * by the one converter, so a load saved from whole pounds reads back as them.
 */
export function formatLoad(kg: number, system: UnitSystem): string {
  if (!Number.isFinite(kg)) return '—'
  const imperial = system === 'imperial'
  const text = (imperial ? kgToLb(kg) : kg).toFixed(imperial ? 1 : 2)
  return `${groupThousands(String(Number(text)))} ${imperial ? 'lb' : 'kg'}`
}
