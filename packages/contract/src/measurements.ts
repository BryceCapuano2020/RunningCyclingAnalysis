import './zodConfig.ts'
import { z } from 'zod'
import { MEASUREMENT_KINDS, MEASUREMENT_SPORTS, isLocalDate } from '@rca/core/athlete'
import type { MeasurementKind } from '@rca/core/athlete'
import { WEIGHT_LIMITS_KG } from './athlete.ts'

/**
 * The values each dated setting accepts, in its stored unit: kg, bpm, W and m/s. Wide on purpose: they
 * refuse a typing slip, not an unusual athlete. The speeds are 11:08 and 2:13 per km.
 */
export const MEASUREMENT_LIMITS: Record<MeasurementKind, { min: number; max: number }> = {
  massKg: WEIGHT_LIMITS_KG.body,
  maxHeartRate: { min: 100, max: 230 },
  thresholdPower: { min: 50, max: 700 },
  thresholdPace: { min: 1.5, max: 7.5 },
}

/** The earliest and latest year a dated setting may start in. */
export const MEASUREMENT_YEARS = { min: 1970, max: 2100 } as const

/** Whether a YYYY-MM-DD date starts in a year dated settings accept (MEASUREMENT_YEARS). */
export function isMeasurementYear(date: string): boolean {
  const year = Number(date.slice(0, 4))
  return year >= MEASUREMENT_YEARS.min && year <= MEASUREMENT_YEARS.max
}

export const MeasurementKindSchema = z.enum(MEASUREMENT_KINDS)

/**
 * One dated setting: a value in effect from a local date. The sport is required for the kinds kept per
 * sport and refused for the others, and the value must be within MEASUREMENT_LIMITS. The entry's
 * identity is its kind, sport and date, so a second entry for the same date replaces the first.
 */
export const MeasurementSchema = z
  .strictObject({
    kind: MeasurementKindSchema,
    sport: z.enum(['run', 'ride']).optional(),
    value: z.number(),
    from: z
      .string()
      .refine((date) => isLocalDate(date) && isMeasurementYear(date), 'Enter a real date'),
  })
  .superRefine((entry, ctx) => {
    const sports = MEASUREMENT_SPORTS[entry.kind]
    const sportOk =
      sports.length === 0 ? entry.sport === undefined : entry.sport && sports.includes(entry.sport)
    if (!sportOk) {
      ctx.addIssue({
        code: 'custom',
        path: ['sport'],
        message: 'This setting does not take that sport',
      })
    }
    const { min, max } = MEASUREMENT_LIMITS[entry.kind]
    if (!(entry.value >= min && entry.value <= max)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Enter a value from ${min} to ${max}`,
      })
    }
  })
export type MeasurementInput = z.infer<typeof MeasurementSchema>

/** GET /api/measurements: every dated setting of the account. */
export const MeasurementListSchema = z.object({ items: z.array(MeasurementSchema) })
export type MeasurementList = z.infer<typeof MeasurementListSchema>

/** The text DELETE /api/measurements/:key takes: kind, then sport when the kind has one, then date. */
export const MeasurementKeySchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z]+(\.[a-z]+)?\.\d{4}-\d{2}-\d{2}$/)

/**
 * The identity a key names, or null when the text is not a key. The sport is present exactly for the
 * kinds that take one, so a key for another shape never matches a stored row.
 */
export function parseMeasurementKey(
  key: string,
): Pick<MeasurementInput, 'kind' | 'sport' | 'from'> | null {
  if (!MeasurementKeySchema.safeParse(key).success) return null
  const parts = key.split('.')
  const from = parts.pop() ?? ''
  const kind = MeasurementKindSchema.safeParse(parts[0])
  if (!kind.success) return null
  const sports: readonly string[] = MEASUREMENT_SPORTS[kind.data]
  const sport = parts[1]
  const wanted = sports.length === 0 ? 1 : 2
  if (parts.length !== wanted || !isLocalDate(from)) return null
  if (sport === undefined) return { kind: kind.data, from }
  return sports.includes(sport) ? { kind: kind.data, sport: sport as 'run' | 'ride', from } : null
}
