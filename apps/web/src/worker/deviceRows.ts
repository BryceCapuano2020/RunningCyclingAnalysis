import { DIGEST_VERSION, parseDigest } from '@rca/core/digest'
import { parseRouteShape } from '@rca/core/route/routeShape'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest } from '@rca/core/types'
import { deviceFileOf } from './deviceFile'
import type { DeviceFile } from './deviceFile'

/**
 * Digests are kept in the same JSON form the server stores, so the numbers a digest leaves
 * undefined (NaN) survive and are checked the same way on the way back. Anything that no longer
 * reads as a digest is not used.
 */
export function readDigest(value: unknown): ActivityDigest | null {
  if (typeof value !== 'string') return null
  try {
    return parseDigest(value)
  } catch {
    return null
  }
}

/** Whether a stored row holds a digest in a format later than this version reads. */
export function fromNewerVersion(value: unknown): boolean {
  const json =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'digest' in value
        ? value.digest
        : null
  if (typeof json !== 'string') return false
  try {
    const parsed: unknown = JSON.parse(json)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'number' &&
      parsed.version > DIGEST_VERSION
    )
  } catch {
    return false
  }
}

/**
 * A stored row: the digest, the route kept with it, and the file it was made from. A row written before
 * routes were kept holds the digest alone, and one written before files were recorded has no file; both
 * still read.
 */
export interface Row {
  digest: ActivityDigest
  route: RouteShape | null
  file: DeviceFile | null
}

export function readFile(value: object): DeviceFile | null {
  const name = 'fileName' in value ? value.fileName : undefined
  const hash = 'fileHash' in value ? value.fileHash : undefined
  return typeof name === 'string' && typeof hash === 'string'
    ? deviceFileOf({ fileName: name, fileHash: hash })
    : null
}

export function readRow(value: unknown): Row | null {
  if (typeof value === 'string') {
    const digest = readDigest(value)
    return digest === null ? null : { digest, route: null, file: null }
  }
  if (typeof value !== 'object' || value === null || !('digest' in value)) return null
  const digest = readDigest(value.digest)
  const route = 'route' in value ? parseRouteShape(value.route) : null
  return digest === null ? null : { digest, route, file: readFile(value) }
}
