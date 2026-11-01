import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest } from '@rca/core/types'
import { LibraryReplaced } from '../worker/deviceFile'
import type { DeviceFile, DeviceLibrary } from '../worker/deviceLibrary'

/**
 * The device library in memory, for tests. Like IndexedDB, it lists entries in key order, not in
 * the order they were written.
 */
export function memoryDeviceLibrary(): DeviceLibrary {
  let epoch = 0
  const entries = new Map<
    string,
    { digest: ActivityDigest; route: RouteShape | null; file: DeviceFile | null }
  >()
  const all = async () =>
    [...entries]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([workoutKey, { digest, file }]) =>
        file === null ? { workoutKey, digest } : { workoutKey, digest, file },
      )
  return {
    all,
    skipped: () => 0,
    get: async (workoutKey) => entries.get(workoutKey)?.digest ?? null,
    lookup: async (workoutKey) => entries.get(workoutKey)?.digest ?? null,
    route: async (workoutKey) => entries.get(workoutKey)?.route ?? null,
    put: async (workoutKey, digest, route = null, file = null, expected) => {
      if (expected !== undefined && expected !== epoch) throw new LibraryReplaced()
      entries.set(workoutKey, { digest, route, file })
    },
    backfillFile: async (workoutKey, digestId, file) => {
      const row = entries.get(workoutKey)
      if (row !== undefined && row.file === null && row.digest.id === digestId) {
        entries.set(workoutKey, { ...row, file })
      }
    },
    setLabel: async (workoutKey, digestId, { from, athleteType }, expected) => {
      if (expected !== undefined && expected !== epoch) throw new LibraryReplaced()
      const row = entries.get(workoutKey)
      if (row === undefined || row.digest.id !== digestId) return false
      if ((row.digest.athleteType ?? null) !== from) return false
      const { athleteType: _was, ...rest } = row.digest
      entries.set(workoutKey, {
        ...row,
        digest: athleteType === null ? rest : { ...rest, athleteType },
      })
      return true
    },
    remove: async (workoutKey) => {
      entries.delete(workoutKey)
    },
    removeIfDigest: async (workoutKey, digestId) => {
      if (entries.get(workoutKey)?.digest.id !== digestId) return false
      entries.delete(workoutKey)
      return true
    },
    clear: async () => {
      entries.clear()
      epoch++
    },
    epoch: async () => epoch,
  }
}
