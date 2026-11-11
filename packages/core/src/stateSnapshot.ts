import { ANALYSIS_REVISION } from './analysisRevision'
import { MODEL_REVISION } from './digest/modelRevision'
import { LIFT_REVISION } from './lift/revision'
import type { LiftResults } from './lift/liftResults'
import type { CheckInSnapshot } from './lookback/snapshot'
import type { SessionState } from './sessionState'

/**
 * A `SessionState` as plain JSON, for a copy kept on the device and for the one the server computes
 * (docs/design/server-compute.md, decision 7). The browser applies a snapshot only when its `schemaVersion` and
 * `modelRevision` are its own build's; otherwise it computes locally.
 */
export const STATE_SNAPSHOT_VERSION = 2

/** A value JSON cannot hold, written as a tagged object. `$` is reserved: no object of the state may use it as a key. */
type Tagged =
  | { $: 'Map'; e: [Json, Json][] }
  | { $: 'Set'; e: Json[] }
  | { $: 'NaN' | 'Infinity' | '-Infinity' | '-0' | 'undefined' }

type Json = null | boolean | number | string | Json[] | { [key: string]: Json } | Tagged

/** What a snapshot says about the run that made it. */
export interface SnapshotMeta {
  /** Counts every change to the inputs; the account's `library_version` for a server snapshot, 0 for a device's. */
  libraryVersion: number
  /** The instant the analysis treated as now. */
  nowMs: number
  /** The viewer's zone by name (an IANA name), as the days were cut in it. */
  zone: string
  /** The build that made the snapshot. */
  buildSha: string
}

export interface StateSnapshot extends SnapshotMeta {
  schemaVersion: number
  modelRevision: number
  /** The combine-time analysis it was made under (`ANALYSIS_REVISION`); absent from a snapshot made before it existed. */
  analysisRevision?: number
  /** The lift estimator the lift results were made under (`LIFT_REVISION`); absent from a snapshot made before they were carried. */
  liftRevision?: number
  /** The state with its `Map`s, `Set`s and non-finite numbers tagged (`encodeValue`). */
  state: Json
  /** The account's `LiftResults`, encoded as `state` is; absent from a copy made on a device, which builds them from its own log. */
  lift?: Json
  /** The `CheckInSnapshot` of the library as the analysis reads it, encoded; null for an empty library. Absent as `lift` is. */
  checkIn?: Json
}

/** What a snapshot carries beside the session state. */
export interface SnapshotExtras {
  lift: LiftResults
  checkIn: CheckInSnapshot | null
}

const SPECIAL_NUMBERS = new Map<string, number>([
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['-0', -0],
])

function encodeValue(value: unknown, path: string): Json {
  if (value === undefined) return { $: 'undefined' }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value
    return {
      $: Number.isNaN(value) ? 'NaN' : Object.is(value, -0) ? '-0' : (String(value) as '-Infinity'),
    }
  }
  if (Array.isArray(value)) return value.map((item, i) => encodeValue(item, `${path}[${i}]`))
  if (value instanceof Map)
    return {
      $: 'Map',
      e: [...value].map(([k, v]) => [encodeValue(k, path), encodeValue(v, `${path}.${String(k)}`)]),
    }
  if (value instanceof Set) return { $: 'Set', e: [...value].map((v) => encodeValue(v, path)) }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: { [key: string]: Json } = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === '$') throw new TypeError(`snapshot: reserved key "$" at ${path}`)
      out[key] = encodeValue(item, `${path}.${key}`)
    }
    return out
  }
  // A class instance, a typed array, a function: not part of a state, so a new one fails here and not in a later read.
  throw new TypeError(`snapshot: cannot hold a ${typeof value} value at ${path}`)
}

function decodeValue(json: Json): unknown {
  if (json === null || typeof json !== 'object') return json
  if (Array.isArray(json)) return json.map(decodeValue)
  if ('$' in json) {
    const tag = json as Tagged
    if (tag.$ === 'undefined') return undefined
    if (tag.$ === 'Map') return new Map(tag.e.map(([k, v]) => [decodeValue(k), decodeValue(v)]))
    if (tag.$ === 'Set') return new Set(tag.e.map(decodeValue))
    const special = SPECIAL_NUMBERS.get(tag.$)
    if (special === undefined) throw new TypeError(`snapshot: unknown tag "${String(tag.$)}"`)
    return special
  }
  return Object.fromEntries(Object.entries(json).map(([key, item]) => [key, decodeValue(item)]))
}

/**
 * The snapshot of a state: plain JSON, whole, so `fromSnapshot` of it (or of its JSON text) is deep-equal to the state.
 * Its keys come in one order whoever builds it, so the text hashes the same (the ETag).
 */
export function toSnapshot(
  state: SessionState,
  meta: SnapshotMeta,
  extras?: SnapshotExtras,
): StateSnapshot {
  return {
    schemaVersion: STATE_SNAPSHOT_VERSION,
    modelRevision: MODEL_REVISION,
    analysisRevision: ANALYSIS_REVISION,
    liftRevision: LIFT_REVISION,
    libraryVersion: meta.libraryVersion,
    nowMs: meta.nowMs,
    zone: meta.zone,
    buildSha: meta.buildSha,
    state: encodeValue(state, 'state'),
    ...(extras === undefined
      ? {}
      : {
          lift: encodeValue(extras.lift, 'lift'),
          checkIn: encodeValue(extras.checkIn, 'checkIn'),
        }),
  }
}

/** The lift results a snapshot carries, or null when it carries none (a device's copy). Check `snapshotIsCurrent` first. */
export function liftOfSnapshot(snapshot: StateSnapshot): LiftResults | null {
  return snapshot.lift === undefined ? null : (decodeValue(snapshot.lift) as LiftResults)
}

/** The check-in snapshot a snapshot carries; null for an empty library and for a snapshot that carries none. */
export function checkInOfSnapshot(snapshot: StateSnapshot): CheckInSnapshot | null {
  return snapshot.checkIn === undefined
    ? null
    : (decodeValue(snapshot.checkIn) as CheckInSnapshot | null)
}

/** The state a snapshot holds. Check `snapshotIsCurrent` first: this does not read an older or newer shape. */
export function fromSnapshot(snapshot: StateSnapshot): SessionState {
  return decodeValue(snapshot.state) as SessionState
}

/**
 * Whether this build may show the snapshot: its shape, its digest model, its combine-time analysis and its lift estimator are
 * this build's (decision 7). One made before a change to how a figure is worked out (a model-ledger row) is stale, so it is not shown.
 */
export function snapshotIsCurrent(
  snapshot: Pick<
    StateSnapshot,
    'schemaVersion' | 'modelRevision' | 'analysisRevision' | 'liftRevision'
  >,
): boolean {
  return (
    snapshot.schemaVersion === STATE_SNAPSHOT_VERSION &&
    snapshot.modelRevision === MODEL_REVISION &&
    snapshot.analysisRevision === ANALYSIS_REVISION &&
    snapshot.liftRevision === LIFT_REVISION
  )
}

export { ANALYSIS_REVISION } from './analysisRevision'

/**
 * What the athlete sees, hashed: the shape and model, the zone and the state. The instant, the counter and the build are
 * not in it, so a recompute that changes no figure has the same hash (decision 9). The server names its snapshot by it
 * (the ETag of GET /api/state), and a browser that holds a copy computes the same hash to ask whether it is still the
 * latest.
 */
export async function snapshotContentHash(snapshot: StateSnapshot): Promise<string> {
  const { libraryVersion: _version, nowMs: _now, buildSha: _build, ...content } = snapshot
  // The check-in is stamped with the instant it was taken, which is not something the athlete sees change.
  if (content.checkIn !== undefined && content.checkIn !== null && !Array.isArray(content.checkIn))
    content.checkIn = { ...(content.checkIn as { [key: string]: Json }), atMs: 0 }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(content)),
  )
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
