import { digestActivity } from '../../digest/digestActivity'
import { syntheticActivity } from '../../digest/test/syntheticActivity'
import type { ActivityDigest, DigestDistributions, Sport } from '../../types'

/** Local noon on a date, so the local day is the date in any time zone. */
export const noon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).getTime()

export interface DigestSpec {
  id: string
  sport: Sport
  startMs: number
  /** Seconds in a single bin of each measure: [bin, seconds]. Absent measures keep no distribution. */
  heartRate?: [bin: number, seconds: number]
  power?: [bin: number, seconds: number]
  speed?: [bin: number, seconds: number]
  /** Leaves the digest without any distributions, as a digest from before they were kept. */
  older?: boolean
}

/** A digest of a short activity whose distributions are the ones given. */
export function zoneDigest(spec: DigestSpec): ActivityDigest {
  const base = digestActivity(
    syntheticActivity({ n: 60, id: spec.id, sport: spec.sport, startMs: spec.startMs }),
  )
  const one = (entry?: [number, number]) =>
    entry === undefined ? undefined : { offset: entry[0], counts: [entry[1]] }
  const distributions: DigestDistributions = {}
  for (const measure of ['heartRate', 'power', 'speed'] as const) {
    const distribution = one(spec[measure])
    if (distribution !== undefined) distributions[measure] = distribution
  }
  const { distributions: _kept, ...rest } = base
  return spec.older === true ? rest : { ...rest, distributions }
}
