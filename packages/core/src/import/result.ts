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

/**
 * The reason a file was refused. `detail` carries what the code needs, such as a sport's name. `listed`
 * is true when that name is the type the export's own list gives, such as Strava's "Kayaking", which
 * reads as written. A name the file gives, such as a FIT sport enum or a number, is not.
 */
export interface Rejection {
  reason: string
  code: RejectCode
  detail?: string
  listed?: boolean
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
  /**
   * The name the file's export gives the activity that started at an instant, for an export that names
   * its activities by start time rather than by file, such as Garmin's. Asked with each activity's own
   * start. The file's `activityName`, when it has one, wins.
   */
  nameAt?: (startMs: number) => string | undefined
  /**
   * The type the file's export gives the activity, such as Strava's "Trail Run" or "Virtual Ride". It
   * fills in a sport the file does not say: a GPX track with no type or only a number the app does not
   * know, or a TCX activity whose Sport is Other. A sport the file names is never overridden, and a FIT
   * file always keeps its own. The one exception is an e-bike type, which refuses the file whatever
   * sport it names.
   */
  activityType?: string
  /**
   * An id for this upload, such as the hash of its bytes. The legs of one upload share it as their
   * session key. Never the file name: two uploads of the same name are different sessions. Absent
   * when the caller gives none, and then the legs share no session.
   */
  sessionKey?: string
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
  return refused(fileName, { reason, code, detail })
}

/** A refused file's result, from its rejection. The detail and the list mark are left out when absent. */
export function refused(fileName: string, rejection: Rejection): ParseResult {
  const { reason, code, detail, listed } = rejection
  return {
    ok: false,
    fileName,
    reason,
    code,
    ...(detail === undefined ? {} : { detail }),
    ...(listed === true ? { listed } : {}),
  }
}
