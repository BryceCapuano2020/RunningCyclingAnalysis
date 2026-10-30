import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import { digestActivity } from './digestActivity'
import { MODEL_REVISION } from './modelRevision'
import { MAX_HR_BLOCKS } from './readLimits'
import { pathSegments, readDigest, readIdentity, tryReadDigest } from './readResult'
import { CREATE_RULES, DEVICE_RULES, RULES_OF_VIEW, STORED_RULES } from './readRules'
import { serializeDigest } from './serialize'

const wire = JSON.parse(serializeDigest(digestActivity(sampleDataset().activities[0]!))) as Record<
  string,
  unknown
>

describe('pathSegments', () => {
  it('splits a path as the readers name it', () => {
    expect(pathSegments('startMs')).toEqual(['startMs'])
    expect(pathSegments('flags[2].start')).toEqual(['flags', 2, 'start'])
    expect(pathSegments('splits.km[0].seconds')).toEqual(['splits', 'km', 0, 'seconds'])
    expect(pathSegments('curve[3].terms.aero')).toEqual(['curve', 3, 'terms', 'aero'])
    expect(pathSegments('digest')).toEqual([])
  })
})

describe('tryReadDigest', () => {
  it('gives the digest, or the first path and problem, with what names the activity', () => {
    const ok = tryReadDigest(wire, 'create')
    expect(ok.ok && ok.digest.id).toBe(wire.id)
    expect(tryReadDigest({ ...wire, startMs: 1e300 }, 'create')).toEqual({
      ok: false,
      path: 'startMs',
      problem: `must be from 0 to ${Date.UTC(2100, 0, 1)}`,
      kind: 'range',
      identity: null,
      newer: false,
    })
    expect(tryReadDigest(null, 'stored')).toEqual({
      ok: false,
      path: 'digest',
      problem: 'must be an object',
      kind: 'shape',
      identity: null,
      newer: false,
    })
  })

  it('reads the same value as readDigest, which throws', () => {
    expect(() => readDigest({ ...wire, version: 2 }, 'device')).toThrow(/version must be 1/)
  })

  it('carries the identity of a digest it refuses, and says on the stored view when a newer build wrote it', () => {
    const identity = (extra: Record<string, unknown>) => {
      const read = tryReadDigest({ ...wire, ...extra }, 'stored')
      return read.ok ? null : read
    }
    const expected = {
      id: wire.id,
      name: wire.name,
      sport: wire.sport,
      startMs: wire.startMs,
      modelRevision: wire.modelRevision,
      version: 1,
    }
    // A format above this build's, a sport it does not know, and a revision above its own that does not read.
    const format = identity({ version: 2 })
    expect(format).toMatchObject({ newer: true, identity: { ...expected, version: 2 } })
    const sport = identity({ sport: 'swim' })
    const { sport: _sport, ...withoutSport } = expected
    expect(sport).toMatchObject({ newer: true, identity: withoutSport })
    const revision = identity({ modelRevision: MODEL_REVISION + 1, curve: 'a new shape' })
    expect(revision).toMatchObject({ newer: true, identity: { modelRevision: MODEL_REVISION + 1 } })
    // Damage in a digest of this build is not a newer build's, whatever the view.
    expect(identity({ curve: 'damage' })).toMatchObject({ newer: false, identity: expected })
    expect(tryReadDigest({ ...wire, version: 2 }, 'device')).toMatchObject({ newer: false })
    expect(tryReadDigest({ ...wire, version: 2 }, 'create')).toMatchObject({ newer: false })
    // Without an id there is nobody to list.
    const { id: _id, ...anonymous } = wire
    expect(tryReadDigest({ ...anonymous, version: 2 }, 'stored')).toMatchObject({ identity: null })
  })

  it('reads a revision above its own in full when the digest otherwise reads', () => {
    const read = tryReadDigest({ ...wire, modelRevision: MODEL_REVISION + 3 }, 'stored')
    expect(read.ok && read.digest.modelRevision).toBe(MODEL_REVISION + 3)
  })
})

describe('readIdentity', () => {
  it('reads what names an activity, and nothing it has to trust more than that', () => {
    expect(readIdentity(wire)).toEqual({
      id: wire.id,
      name: wire.name,
      sport: wire.sport,
      startMs: wire.startMs,
      modelRevision: wire.modelRevision,
      version: 1,
    })
    const { modelRevision: _drop, ...old } = wire
    expect(readIdentity({ ...old, version: 7 })).toMatchObject({ modelRevision: 1, version: 7 })
  })

  it('has none for a digest with no id, name, start or whole version and revision', () => {
    for (const damage of [
      { id: 4 },
      { name: null },
      { startMs: 1e300 },
      { startMs: '5' },
      { version: 1.5 },
      { version: 0 },
      { modelRevision: -1 },
      { modelRevision: 'new' },
    ]) {
      expect(readIdentity({ ...wire, ...damage }), JSON.stringify(damage)).toBeNull()
    }
    expect(readIdentity(null)).toBeNull()
    expect(readIdentity([])).toBeNull()
  })
})

describe('the rules of each view', () => {
  it('tell a create, a stored row and the device library apart', () => {
    expect(RULES_OF_VIEW).toEqual({
      create: CREATE_RULES,
      stored: STORED_RULES,
      device: DEVICE_RULES,
    })
    // A create is held to every rule and takes nothing it does not know.
    expect(CREATE_RULES).toMatchObject({ lenient: false, tolerant: false, arrayFactor: 1 })
    // A stored row is read as it was written, within bounds, and may come from a newer build.
    expect(STORED_RULES).toMatchObject({ lenient: true, tolerant: true, arrayFactor: 4 })
    // The device library keeps every rule of the shape, but its rows may come from a newer build.
    expect(DEVICE_RULES).toMatchObject({ lenient: false, tolerant: true, arrayFactor: 1 })
  })

  it('read a duration that is missing only in a stored row', () => {
    const legacy = {
      ...wire,
      durationS: null,
      hrBlocks: [],
      climbSections: [],
      distanceBests: undefined,
    }
    expect(tryReadDigest(legacy, 'create').ok).toBe(false)
    expect(tryReadDigest(legacy, 'device').ok).toBe(false)
    const stored = tryReadDigest(legacy, 'stored')
    expect(stored.ok && Number.isNaN(stored.digest.durationS)).toBe(true)
  })
})

describe('a tolerant reader', () => {
  const run = JSON.parse(
    serializeDigest(digestActivity(sampleDataset().activities.find((a) => a.sport === 'run')!)),
  ) as Record<string, unknown>
  const views = ['stored', 'device'] as const

  it.each(views)('%s: takes a number out of bounds as the field being unknown', (view) => {
    const read = readDigest(
      {
        ...run,
        distanceM: 1e12,
        elevationGainM: -1,
        maxHeartRate: 400,
        avgHeartRate: 400,
        avgPowerW: -3,
        movingS: 1e12,
      },
      view,
    )
    expect(read.distanceM).toBeNaN()
    expect(read.elevationGainM).toBeNaN()
    expect(read.maxHeartRate).toBeNull()
    expect(read.avgHeartRate).toBeNull()
    expect(read.avgPowerW).toBeNull()
    expect(read).not.toHaveProperty('movingS')
    expect(() => readDigest({ ...run, distanceM: 1e12 }, 'create')).toThrow()
  })

  it.each(views)(
    '%s: clamps a moving time past the duration, and drops a mark that is not true',
    (view) => {
      const read = readDigest({ ...run, movingS: (run.durationS as number) + 5, race: 'yes' }, view)
      expect(read.movingS).toBe(read.durationS)
      expect(read).not.toHaveProperty('race')
    },
  )

  it.each(views)('%s: cuts a list longer than its cap and drops a part it cannot place', (view) => {
    const flag = { kind: 'power-spike', start: 0, end: 5, message: 'm' }
    const flags = [flag, { ...flag, end: 1e9 }, { ...flag, start: 7, end: 3 }, flag]
    const read = readDigest(
      {
        ...run,
        flags,
        hrBlocks: Array.from({ length: 10_000 }, () => ({ heartRate: 1, value: 1, terms: null })),
      },
      view,
    )
    // A row from an older revision keeps the order it was written in; a new digest's flags are placed.
    expect(read.flags).toEqual(view === 'stored' ? [flag, flags[2], flag] : [flag, flag])
    const cap =
      view === 'stored' ? 4 * MAX_HR_BLOCKS : Math.floor(((run.durationS as number) - 600) / 300)
    expect(read.hrBlocks).toHaveLength(cap)
  })

  it.each(views)(
    '%s: reads a split whose distance is out of bounds as no split, with no pace',
    (view) => {
      const split = {
        distanceM: 1e9,
        seconds: 300,
        gradeAdjustedSeconds: 290,
        elevationGainM: 5,
        avgHeartRate: 150,
      }
      const good = { ...split, distanceM: 1000 }
      const read = readDigest({ ...run, splits: { km: [good, split, good], mile: [] } }, view)
      expect(read.splits?.km).toEqual([
        good,
        {
          distanceM: 0,
          seconds: null,
          gradeAdjustedSeconds: null,
          elevationGainM: null,
          avgHeartRate: null,
        },
        good,
      ])
      expect(() => readDigest({ ...run, splits: { km: [split], mile: [] } }, 'create')).toThrow()
    },
  )

  it.each(views)(
    '%s: drops a flag count that is negative or fractional, and keeps the row',
    (view) => {
      const read = readDigest(
        { ...run, flagCounts: { 'hr-spike': -1, 'power-spike': 1.5, 'hr-dropout': 2 } },
        view,
      )
      expect(read.flagCounts).toEqual({ 'hr-dropout': 2 })
      expect(() => readDigest({ ...run, flagCounts: { 'hr-spike': -1 } }, 'create')).toThrow(
        /non-negative integer/,
      )
      expect(() => readDigest({ ...run, flagCounts: { 'hr-spike': 'many' } }, view)).toThrow()
    },
  )

  it.each(views)('%s: still refuses a value of the wrong type, as damage', (view) => {
    for (const damage of [
      { distanceM: 'far' },
      { maxHeartRate: 'fast' },
      { flags: [{ kind: 7, start: 0, end: 1, message: 'm' }] },
      { startMs: null },
      { sport: 4 },
    ]) {
      expect(() => readDigest({ ...run, ...damage }, view), JSON.stringify(damage)).toThrow()
    }
  })
})
