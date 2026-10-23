import type { Activity } from '../types'

/** The result contract every activity parser (FIT, GPX, TCX) returns, and the limits they enforce. */

export type ParseResult =
  | { ok: true; activities: Activity[]; skipped: string[]; droppedValues: number }
  | { ok: false; fileName: string; reason: string }

export interface ParseLimits {
  maxFileBytes: number
  /** The most records one file may hold: FIT record messages, or GPX and TCX trackpoints. */
  maxRecordMessages: number
  /** The longest single activity, in seconds. */
  maxActivitySeconds: number
}

export interface ParseOptions {
  /** The clock for the date check, in epoch milliseconds. Defaults to Date.now(). */
  nowMs?: number
}

/** 48 hours at 1 Hz: the most grid samples one file may produce, summed over its units. */
export const MAX_FILE_SAMPLES = 172_800

export const DEFAULT_PARSE_LIMITS: Readonly<ParseLimits> = {
  maxFileBytes: 64 * 1024 ** 2,
  maxRecordMessages: 2_000_000,
  maxActivitySeconds: MAX_FILE_SAMPLES,
}

export const NO_RECORDS = 'File contains no activity records'

export function failure(fileName: string, reason: string): ParseResult {
  return { ok: false, fileName, reason }
}
