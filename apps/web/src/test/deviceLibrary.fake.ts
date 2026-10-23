import type { ActivityDigest } from '@rca/core/types'
import type { DeviceLibrary } from '../worker/deviceLibrary'

/**
 * The device library in memory, for tests. Like IndexedDB, it lists entries in key order, not in
 * the order they were written.
 */
export function memoryDeviceLibrary(): DeviceLibrary {
  const entries = new Map<string, ActivityDigest>()
  return {
    all: async () =>
      [...entries]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([workoutKey, digest]) => ({ workoutKey, digest })),
    get: async (workoutKey) => entries.get(workoutKey) ?? null,
    put: async (workoutKey, digest) => {
      entries.set(workoutKey, digest)
    },
    remove: async (workoutKey) => {
      entries.delete(workoutKey)
    },
    clear: async () => entries.clear(),
  }
}
