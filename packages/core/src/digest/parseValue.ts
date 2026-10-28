/** Checks for reading a digest's JSON: each returns the value as its type or throws an Error naming the field. */

export type Json = Record<string, unknown>

export function fail(path: string, problem: string): never {
  throw new Error(`parseDigest: ${path} ${problem}`)
}

export function asObject(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object')
  }
  return value as Json
}

export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  return value
}

export function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string')
  return value
}

export function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}

export function asInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'must be an integer')
  return value
}

export function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

/** A finite number, or null where the value was NaN. Infinity is rejected. */
export function asNumberOrNaN(value: unknown, path: string): number {
  if (value === null) return NaN
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a number or null')
  return value
}

export function asNonNegativeInteger(value: unknown, path: string): number {
  const n = asInteger(value, path)
  if (n < 0) fail(path, 'must not be negative')
  return n
}

export function asPositive(value: unknown, path: string): number {
  const n = asFinite(value, path)
  if (!(n > 0)) fail(path, 'must be positive')
  return n
}

/** Fails unless 0 <= start < end <= durationS. */
export function checkRange(start: number, end: number, durationS: number, path: string): void {
  if (!(0 <= start && start < end && end <= durationS)) {
    fail(path, 'must satisfy 0 <= start < end <= durationS')
  }
}

export function asFiniteOrNull(value: unknown, path: string): number | null {
  return value === null ? null : asFinite(value, path)
}

export function asOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const found = options.find((option) => option === value)
  if (found === undefined) fail(path, `must be one of ${options.join(', ')}`)
  return found
}
