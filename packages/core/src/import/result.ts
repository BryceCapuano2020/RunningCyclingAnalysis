import { MIB } from '../constants'
import type { Activity } from '../types'

/** The result contract every activity parser (FIT, GPX, TCX) returns, and the limits they enforce. */

/**
 * Why a file was not read. The app words each code for its users; the English reason is kept for
 * logs and older callers. `not-activity`: the format is not one the app reads, or a zip holds none
 * of them. `corrupt`: the file has an activity format, but its content cannot be read.
 */
export type RejectCode =
  | 'not-activity'
  | 'corrupt'
  | 'empty'
  | 'too-large'
  | 'too-much-data'
  | 'too-long'
  | 'too-short'
  | 'too-sparse'
  | 'no-date'
  | 'implausible-date'
  | 'unsupported-sport'
  | 'no-sport'
  | 'e-bike'
  | 'duplicate'
  | 'unreadable'

/** The reason a file was refused. `detail` carries what the code needs, such as a sport's name. */
export interface Rejection {
  reason: string
  code: RejectCode
  detail?: string
}

export type ParseResult =
  | { ok: true; activities: Activity[]; skipped: string[]; droppedValues: number }
  | ({ ok: false; fileName: string } & Rejection)

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
  /**
   * The name the file's export gives the activity, such as Strava's activities.csv. It is used
   * before any title in the file.
   */
  activityName?: string
}

/** 48 hours at 1 Hz: the most grid samples one file may produce, summed over its units. */
export const MAX_FILE_SAMPLES = 172_800

export const DEFAULT_PARSE_LIMITS: Readonly<ParseLimits> = {
  maxFileBytes: 64 * MIB,
  maxRecordMessages: 2_000_000,
  maxActivitySeconds: MAX_FILE_SAMPLES,
}

export const NO_RECORDS = 'File contains no activity records'

export function failure(
  fileName: string,
  reason: string,
  code: RejectCode,
  detail?: string,
): ParseResult {
  return {
    ok: false,
    fileName,
    reason,
    code,
    ...(detail === undefined ? {} : { detail }),
  }
}
