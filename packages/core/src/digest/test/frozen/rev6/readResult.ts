import type { ActivityDigest, Sport } from './types'
import { DIGEST_VERSION } from '../../../modelRevision'

/** The model revision this build wrote and read; a digest above it is a newer build's. */
const FROZEN_MODEL_REVISION = 6
import { DigestReadError } from './parseValue'
import type { ProblemKind } from './parseValue'
import { readDigest } from './readDigest'
import {
  EARLIEST_ACTIVITY_START_MS,
  LATEST_ACTIVITY_START_MS,
  MAX_DIGEST_TEXT_CHARS,
} from './readLimits'
import type { DigestView } from './readRules'

export { readDigest }
export type { DigestView }

const SPORTS: readonly Sport[] = ['run', 'ride']

/**
 * What names an activity, read apart from the rest of its digest: enough to list it and to know which
 * revision or format wrote it. A digest this build cannot read in full may still have one.
 */
export interface DigestIdentity {
  id: string
  name: string
  /** Absent when the digest names a sport this build does not know. */
  sport?: Sport
  startMs: number
  modelRevision: number
  version: number
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_DIGEST_TEXT_CHARS ? value : null
}

function integerFrom(value: unknown, least: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= least ? value : null
}

/**
 * The identity of a digest, or null when it does not have one that can be shown: no id or name, a start
 * outside the range a date can show, or a version or revision that is not a whole number. It reads
 * nothing else, so it does not depend on the rules of any build.
 */
export function readIdentity(value: unknown): DigestIdentity | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const o = value as Record<string, unknown>
  const id = text(o.id)
  const name = text(o.name)
  const version = integerFrom(o.version, 1)
  const modelRevision = o.modelRevision === undefined ? 1 : integerFrom(o.modelRevision, 1)
  const startMs = o.startMs
  if (id === null || name === null || version === null || modelRevision === null) return null
  if (typeof startMs !== 'number') return null
  if (!(startMs >= EARLIEST_ACTIVITY_START_MS && startMs <= LATEST_ACTIVITY_START_MS)) return null
  const sport = SPORTS.find((s) => s === o.sport)
  return { id, name, ...(sport === undefined ? {} : { sport }), startMs, modelRevision, version }
}

/**
 * Why a value is not a digest under the rules of a view, or the digest. Never throws.
 *
 * A refusal carries what could be read of the activity: its `identity`, and `kind`, which says whether a
 * number was out of bounds (`range`) or the digest is damaged (`shape`). `newer` is true on the stored
 * view when the identity shows a build that is not this one wrote it: a version above this build's, a
 * sport it does not know, or a model revision above its own. Such a digest is not damaged and is not
 * to be dropped silently; a caller can list the activity and ask for it to be rebuilt.
 */
export type DigestReading =
  | { ok: true; digest: ActivityDigest }
  | {
      ok: false
      path: string
      problem: string
      kind: ProblemKind
      identity: DigestIdentity | null
      newer: boolean
    }

function isNewer(value: unknown, identity: DigestIdentity | null): boolean {
  if (identity === null) return false
  const sport = (value as { sport?: unknown }).sport
  const unknownSport = typeof sport === 'string' && identity.sport === undefined
  return (
    identity.version > DIGEST_VERSION ||
    unknownSport ||
    identity.modelRevision > FROZEN_MODEL_REVISION
  )
}

export function tryReadDigest(value: unknown, view: DigestView): DigestReading {
  try {
    return { ok: true, digest: readDigest(value, view) }
  } catch (error) {
    if (!(error instanceof DigestReadError)) throw error
    const identity = readIdentity(value)
    return {
      ok: false,
      path: error.path,
      problem: error.problem,
      kind: error.kind,
      identity,
      newer: view === 'stored' && isNewer(value, identity),
    }
  }
}

/**
 * The segments of a path as the readers name it, for a schema library that wants them apart:
 * `flags[2].start` is `['flags', 2, 'start']`, and the digest itself is no segments.
 */
export function pathSegments(path: string): Array<string | number> {
  // The digest itself, as the reader names it when it is not an object at all.
  if (path === 'digest') return []
  const segments: Array<string | number> = []
  for (const part of path.split('.')) {
    const match = /^([^[]*)((?:\[\d+\])*)$/.exec(part)
    if (match === null) {
      segments.push(part)
      continue
    }
    if (match[1] !== '') segments.push(match[1]!)
    for (const index of match[2]!.matchAll(/\[(\d+)\]/g)) segments.push(Number(index[1]))
  }
  return segments
}
