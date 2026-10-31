import { setViewerZone } from '@rca/core/calendar'
import type { Zone } from '@rca/core/calendar'

/**
 * The device's zone at an instant, in minutes east of UTC. The one place the app reads `Date`'s zone: it is
 * handed to the calendar once, at the start of the page and of the worker, and the calendar arithmetic reads the
 * zone from there.
 */
export const deviceZone: Zone = (ms) => -new Date(ms).getTimezoneOffset()

/**
 * Gives the page the device's zone. The worker has its own copy of the calendar, which `session.setZone` sets, so
 * the figures the page works out itself (the weekly volume under the trend) cut weeks where the worker's do.
 */
export function installDeviceZone(): void {
  setViewerZone(deviceZone)
}
