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
