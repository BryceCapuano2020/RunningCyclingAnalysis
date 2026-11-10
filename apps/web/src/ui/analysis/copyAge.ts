import type { StateSnapshot } from '@rca/core/stateSnapshot'

/** The calendar day of an instant in a zone, as text, for comparing days. */
function dayIn(zone: string, ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(ms)
}

/** The zone this browser is in now. */
export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * This browser's zone when the server could read it back, else undefined: a name the runtime refuses (or one longer than
 * the account settings take) would make every save of the settings fail.
 */
export function reportableZone(): string | undefined {
  const zone = browserZone()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone.length >= 1 && zone.length <= 64 ? zone : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a copy was made on an earlier local day than `nowMs`, or in another zone. Its 12-week window and its days have
 * moved, so it is shown at once and replaced as soon as the live analysis is ready (docs/design/server-compute.md,
 * decision 8).
 */
export function copyIsStale(
  snapshot: Pick<StateSnapshot, 'nowMs' | 'zone'>,
  nowMs: number,
  zone: string = browserZone(),
): boolean {
  return snapshot.zone !== zone || dayIn(zone, snapshot.nowMs) !== dayIn(zone, nowMs)
}
