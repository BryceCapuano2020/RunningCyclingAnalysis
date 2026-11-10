import { readCsvRows } from '../../import/csv'
import { MAX_ACTIVITY_LIST_BYTES, MAX_CSV_CELLS_PER_ROW } from '../../import/limits'
import { LIFT_RPE, MAX_LIFT_SETS_PER_USER } from '../limits'
import { isLiftRpe } from '../validate'
import { assembleHevySets } from './hevyAssemble'
import type { HevyCsvResult, HevyLayout, HevySkip, Staged } from './hevyAssemble'
import { mapHevyExercise } from './hevyExercises'
import { parseHevyTime } from './hevyTime'

/**
 * Hevy's CSV export, read by header. The two layouts below come from third-party descriptions and are
 * NOT verified against a real export; the owner's header row will pin them.
 *   A: Date, Workout Name, Exercise Name, Set Order, Weight (kg), Reps, Distance (m), Duration (s), Notes, RPE
 *   B: title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index,
 *      set_type, weight_kg, reps, distance_km, duration_seconds, rpe
 * Notes and descriptions are never read.
 */
export type { HevyCsvResult, HevyLayout, HevySkip } from './hevyAssemble'

/** The file was not read: not a Hevy header, empty, or past a limit. Nothing was imported. */
export interface HevyCsvRefusal {
  refused: string
}

export interface HevyCsvOptions {
  /** The unit of a weight column that names none. Default kg. */
  units?: 'kg' | 'lb'
}

interface Columns {
  start: string
  session: string
  exercise: string
  setIndex: string
  setType?: string
}

const LAYOUTS: Record<HevyLayout, Columns> = {
  A: { start: 'date', session: 'workout name', exercise: 'exercise name', setIndex: 'set order' },
  B: {
    start: 'start_time',
    session: 'title',
    exercise: 'exercise_title',
    setIndex: 'set_index',
    setType: 'set_type',
  },
}

const WEIGHT_HEADERS = ['weight (kg)', 'weight_kg', 'weight (lbs)', 'weight_lbs', 'weight']

const KG_PER_LB = 0.45359237
// A decimal comma ("22,5") is not read and skips the row; check the real export's number format when pinning.
const NUMBER = /^\d+(\.\d+)?$/
const ZONE = /\d(?:Z|[+-]\d{2}:?\d{2})$/i

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function normaliseHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** A non-negative decimal as written, or null. Blank is not a number. */
function readNumber(text: string): number | null {
  const t = text.trim()
  return NUMBER.test(t) ? Number(t) : null
}

function setType(raw: string): 'normal' | 'warmup' | 'failure' | 'other' {
  const t = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (t === '' || t === 'normal' || t === 'dropset' || t === 'd') return 'normal'
  if (t === 'warmup' || t === 'w') return 'warmup'
  if (t === 'failure' || t === 'f') return 'failure'
  return 'other'
}

/**
 * Reads Hevy CSV text into lift sets; the layout comes from the header and an unknown one is refused.
 * A file past a limit is refused whole. A row that is not a set is skipped with its reason; a bad RPE
 * keeps the set and lists the row in `adjusted`. Set order is renumbered from 1 per date, exercise and
 * equipment by session time, then the file's set index (decisions/lift-set-key.md). A time is the
 * session's start, so its precision is `session`.
 */
export function readHevyCsv(
  text: string,
  options: HevyCsvOptions = {},
): HevyCsvResult | HevyCsvRefusal {
  if (text.length > MAX_ACTIVITY_LIST_BYTES) return { refused: 'The file is too large to read.' }
  const skipped: HevySkip[] = []
  const adjusted: HevySkip[] = []
  const staged: Staged[] = []
  const state: { layout: HevyLayout | null; refused: string | null } = {
    layout: null,
    refused: null,
  }
  let cols: Record<string, number> = {}
  let weightUnit: 'kg' | 'lb' = 'kg'
  let rowNumber = 0
  const lastIndex = new Map<string, number>()

  const ok = readCsvRows(text, MAX_CSV_CELLS_PER_ROW, (fields) => {
    rowNumber++
    if (state.layout === null) {
      const header = fields.map(normaliseHeader)
      const found = header.includes('exercise_title')
        ? 'B'
        : header.includes('exercise name')
          ? 'A'
          : null
      if (found === null) {
        state.refused =
          'Not a Hevy export: the header has neither "Exercise Name" nor "exercise_title".'
        return false
      }
      const names = LAYOUTS[found]
      cols = {}
      header.forEach((h, i) => {
        if (!(h in cols)) cols[h] = i
      })
      const weight = WEIGHT_HEADERS.find((h) => h in cols)
      const missing = [names.start, names.exercise, names.setIndex, 'reps']
        .concat(weight === undefined ? ['weight'] : [])
        .filter((h) => !(h in cols))
      if (missing.length > 0) {
        state.refused = `Not a Hevy export: the header lacks ${missing.map((m) => `"${m}"`).join(', ')}.`
        return false
      }
      state.layout = found
      cols.weight = cols[weight as string] as number
      weightUnit = weight?.includes('kg')
        ? 'kg'
        : weight !== undefined && weight.includes('lb')
          ? 'lb'
          : (options.units ?? 'kg')
      for (const prefix of ['distance', 'duration']) {
        const h = header.find((x) => x.startsWith(prefix))
        if (h !== undefined) cols[prefix] = cols[h] as number
      }
      return true
    }
    if (rowNumber - 1 > MAX_LIFT_SETS_PER_USER) {
      state.refused = `The file holds more than ${MAX_LIFT_SETS_PER_USER} sets.`
      return false
    }
    const names = LAYOUTS[state.layout]
    const cell = (name: string): string => fields[cols[name] ?? -1]?.trim() ?? ''
    const skip = (reason: string): true => {
      skipped.push({ row: rowNumber, reason })
      return true
    }

    if (ZONE.test(cell(names.start))) return skip('The time zone is not supported.')
    const start = parseHevyTime(cell(names.start))
    if (start === null) return skip('The date is not one Hevy writes.')
    const mapped = mapHevyExercise(cell(names.exercise))
    if (mapped === null) return skip('The exercise name has no letters or digits.')

    let type = setType(names.setType === undefined ? '' : cell(names.setType))
    const indexText = cell(names.setIndex)
    const sessionId = `${cell(names.start)}\0${cell(names.session)}`
    // A W, F or D keeps the place after the set before it, in the same session and lift.
    const placeId = `${sessionId}\0${mapped.exercise}\0${mapped.equipment}`
    let index = lastIndex.get(placeId) ?? 0
    if (NUMBER.test(indexText)) index = Number(indexText)
    else if (names.setType === undefined && indexText !== '') {
      // Strong-style files write W, F or D in place of the number.
      type = setType(indexText)
    }
    lastIndex.set(placeId, index)
    if (type === 'other') return skip('The set type is not warm-up, normal, drop or failure.')

    const reps = readNumber(cell('reps'))
    const weightText = cell('weight')
    const weight = weightText === '' ? 0 : readNumber(weightText)
    const cardio = ['distance', 'duration'].some((c) => (readNumber(cell(c)) ?? 0) > 0)
    if ((reps === null || reps === 0) && cardio)
      return skip('A distance or duration set, not a lift.')
    if (reps === null || !Number.isInteger(reps)) return skip('The reps are not a whole number.')
    if (weight === null) return skip('The weight is not a number.')

    const rpeText = cell('rpe')
    let rpe: number | undefined
    if (rpeText !== '') {
      const r = readNumber(rpeText)
      // An RPE of 0 is how a logger writes none: no entry, and a failure set still reads as 10.
      if (r === 0) rpe = type === 'failure' ? LIFT_RPE.max : undefined
      else if (r !== null && isLiftRpe(r)) rpe = r
      else
        adjusted.push({
          row: rowNumber,
          reason: 'The RPE is not 1 to 10 in halves; set kept without it.',
        })
    } else if (type === 'failure') rpe = LIFT_RPE.max

    staged.push({
      row: rowNumber,
      session: sessionId,
      ...start,
      exercise: mapped.exercise,
      equipment: mapped.equipment,
      index,
      reps,
      loadKg: round2(weightUnit === 'lb' ? weight * KG_PER_LB : weight),
      ...(rpe !== undefined && { rpe }),
      warmup: type === 'warmup',
    })
    return true
  })
  if (state.refused !== null) return { refused: state.refused }
  if (!ok) return { refused: 'The file is not readable CSV, or a row or field is past its limit.' }
  if (state.layout === null) return { refused: 'The file is empty.' }
  return assembleHevySets(staged, skipped, adjusted, state.layout)
}
