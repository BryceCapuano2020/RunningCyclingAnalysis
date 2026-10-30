import { afterEach, describe, expect, it } from 'vitest'
import { localDateOf } from '../athlete/measurements'
import { localDayNumber } from './localDay'

type Env = { env: Record<string, string | undefined> }
const env = (globalThis as { process?: Env }).process!.env
const saved = env.TZ

afterEach(() => {
  if (saved === undefined) delete env.TZ
  else env.TZ = saved
})

describe('localDayNumber', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata'])(
    'puts two instants on one day exactly when localDateOf does, around midnights and clock changes, in %s',
    (zone) => {
      env.TZ = zone
      // Every 37 minutes over two years, which crosses each zone's midnights and both clock changes in each year.
      const start = Date.UTC(2023, 0, 1)
      let previous = start
      let mismatches = 0
      for (let ms = start + 37 * 60_000; ms < start + 730 * 86_400_000; ms += 37 * 60_000) {
        const sameDate = localDateOf(ms) === localDateOf(previous)
        const sameNumber = localDayNumber(ms) === localDayNumber(previous)
        if (sameDate !== sameNumber) mismatches++
        previous = ms
      }
      expect(mismatches).toBe(0)
    },
  )
})
