/** Checks for reading a digest's JSON: each returns the value as its type or throws an Error naming the field. */

import { MAX_DIGEST_TEXT_CHARS } from './readLimits'

export type Json = Record<string, unknown>

/**
 * Why a value is refused. `range` is a number of the right type outside what a digest may hold, which
 * a reader of stored data can read as that field being unknown. `shape` is anything else: a value of
 * the wrong type, a missing field, a name nobody knows. That is damage, and no reader repairs it.
 */
export type ProblemKind = 'range' | 'shape'

/** A digest that does not read: where, and what is wrong there. The message names both. */
export class DigestReadError extends Error {
  readonly path: string
  readonly problem: string
  readonly kind: ProblemKind

  constructor(path: string, problem: string, kind: ProblemKind = 'shape') {
    super(`parseDigest: ${path} ${problem}`)
    this.name = 'DigestReadError'
    this.path = path
    this.problem = problem
    this.kind = kind
  }
}

export function fail(path: string, problem: string): never {
  throw new DigestReadError(path, problem)
}

/** Refuses a value that has the right type and is outside its bounds. */
export function failRange(path: string, problem: string): never {
  throw new DigestReadError(path, problem, 'range')
}

/**
 * Reads a value, and when the reader tolerates stored data, takes `unknown` for one that is out of its
 * bounds. A value of the wrong type is still refused: that is damage, not a number nobody can show.
 */
export function whenOutOfRange<T>(tolerant: boolean, unknown: T, read: () => T): T {
  if (!tolerant) return read()
  try {
    return read()
  } catch (error) {
    if (error instanceof DigestReadError && error.kind === 'range') return unknown
    throw error
  }
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

/** A string of at most MAX_DIGEST_TEXT_CHARS characters. */
export function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string')
  if (value.length > MAX_DIGEST_TEXT_CHARS) {
    failRange(path, `must have at most ${MAX_DIGEST_TEXT_CHARS} characters`)
  }
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

function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

/** A finite number, or null where the value was NaN. Infinity is rejected. */
function asNumberOrNaN(value: unknown, path: string): number {
  if (value === null) return NaN
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a number or null')
  return value
}

/** Fails for a number outside min to max. A number below a zero minimum is named as negative. */
function checkBetween(n: number, path: string, min: number, max: number): void {
  if (min === 0 && n < 0) failRange(path, 'must not be negative')
  if (n < min || n > max) failRange(path, `must be from ${min} to ${max}`)
}

/** A finite number from min to max, both included. */
export function asBetween(value: unknown, path: string, min: number, max: number): number {
  const n = asFinite(value, path)
  checkBetween(n, path, min, max)
  return n
}

/** An integer from min to max, both included. */
export function asIntegerBetween(value: unknown, path: string, min: number, max: number): number {
  const n = asInteger(value, path)
  checkBetween(n, path, min, max)
  return n
}

/** A number from min to max, or NaN where the value is null. */
export function asNumberOrNaNBetween(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  const n = asNumberOrNaN(value, path)
  checkBetween(n, path, min, max)
  return n
}

/** A number from min to max, or null. */
export function asBetweenOrNull(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number | null {
  return value === null ? null : asBetween(value, path, min, max)
}

export function asPositive(value: unknown, path: string): number {
  const n = asFinite(value, path)
  if (!(n > 0)) failRange(path, 'must be positive')
  return n
}

/** Fails unless 0 <= start < end <= durationS. */
export function checkRange(start: number, end: number, durationS: number, path: string): void {
  if (!(0 <= start && start < end && end <= durationS)) {
    failRange(path, 'must satisfy 0 <= start < end <= durationS')
  }
}

export function asOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const found = options.find((option) => option === value)
  if (found === undefined) fail(path, `must be one of ${options.join(', ')}`)
  return found
}
