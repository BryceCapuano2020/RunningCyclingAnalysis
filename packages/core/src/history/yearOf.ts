import { civilOfDay, localDayOf } from '../calendar'
import type { ActivityDigest } from '../types'

/** The calendar year an activity falls in, by the athlete's own day: the file's date, else the viewer's zone. */
export const yearOfDigest = (digest: ActivityDigest): number => civilOfDay(localDayOf(digest)).year
