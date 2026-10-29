import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest } from '@rca/core/types'
import type { DeviceLibrary } from '../worker/deviceLibrary'

/**
 * The device library in memory, for tests. Like IndexedDB, it lists entries in key order, not in
 * the order they were written.
 */
export function memoryDeviceLibrary(): DeviceLibrary {
  const entries = new Map<string, { digest: ActivityDigest; route: RouteShape | null }>()
  const all = async () =>
    [...entries]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([workoutKey, { digest }]) => ({ workoutKey, digest }))
  return {
    all,
    get: async (workoutKey) => entries.get(workoutKey)?.digest ?? null,
    lookup: async (workoutKey) => entries.get(workoutKey)?.digest ?? null,
    route: async (workoutKey) => entries.get(workoutKey)?.route ?? null,
    put: async (workoutKey, digest, route = null) => {
      entries.set(workoutKey, { digest, route })
    },
    remove: async (workoutKey) => {
      entries.delete(workoutKey)
    },
    clear: async () => entries.clear(),
  }
}
