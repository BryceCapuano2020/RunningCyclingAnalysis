import { MeasurementListSchema, MeasurementSchema } from '@rca/contract'
import type { MeasurementInput } from '@rca/contract'
import { measurementKey } from '@rca/core/athlete'
import { readJson, request } from './client'

/** A list of dated settings is at most MAX_MEASUREMENTS_PER_USER short rows. */
const BODY_LIMIT = 64 * 1024

/** The account's dated settings, earliest date first. */
export async function listMeasurements(userId?: string): Promise<MeasurementInput[]> {
  const body = await readJson(
    await request('GET', '/api/measurements', undefined, userId),
    MeasurementListSchema,
    BODY_LIMIT,
  )
  return body.items
}

/** Sets the value in effect from a date; the same kind, sport and date replaces the value. */
export async function putMeasurement(
  entry: MeasurementInput,
  userId?: string,
): Promise<MeasurementInput> {
  return readJson(
    await request('PUT', '/api/measurements', { json: entry }, userId),
    MeasurementSchema,
    BODY_LIMIT,
  )
}

export async function deleteMeasurement(
  entry: Pick<MeasurementInput, 'kind' | 'sport' | 'from'>,
  userId?: string,
): Promise<void> {
  const path = `/api/measurements/${encodeURIComponent(measurementKey(entry))}`
  await request('DELETE', path, undefined, userId)
}
