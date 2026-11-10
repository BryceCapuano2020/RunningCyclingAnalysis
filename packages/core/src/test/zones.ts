import type { Zone } from '../calendar'

/** A zone with a fixed offset, in hours east of UTC. */
export const fixedZone =
  (hours: number): Zone =>
  () =>
    hours * 60

/** A northern zone with clock changes (the second Sunday of March to the first of November, at 07:00 UTC), for 2025 and 2026. */
export const dstZone: Zone = (ms) => {
  const year = new Date(ms).getUTCFullYear()
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
    return 1 + ((7 - first) % 7) + (n - 1) * 7
  }
  const start = Date.UTC(year, 2, nthSunday(2, 2), 10)
  const end = Date.UTC(year, 10, nthSunday(10, 1), 9)
  return ms >= start && ms < end ? -7 * 60 : -8 * 60
}
