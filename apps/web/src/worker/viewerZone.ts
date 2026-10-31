import type { Zone } from '@rca/core/calendar'

/**
 * The device's zone at an instant, in minutes east of UTC. The one place the worker reads `Date`'s zone: it is
 * handed to the session once, and the calendar arithmetic reads the zone from there.
 */
export const deviceZone: Zone = (ms) => -new Date(ms).getTimezoneOffset()
