/** One logged set of a lift on a day. */
export interface LiftSetRow {
  key: string
  reps: number
  loadKg: number
  rpe?: number
  warmup?: boolean
}

/** A lift trained on a day with one equipment, and its sets in set order. */
export interface LiftOfDay {
  name: string
  equipment: string
  sets: readonly LiftSetRow[]
}

/** A day with sets, for the list of earlier sessions: its date and the names of the lifts trained. */
export interface EarlierDay {
  day: string
  lifts: readonly string[]
}

/** What the account says about sets not yet kept: signed in only. */
export interface LiftStatus {
  /** Sets waiting to be sent. */
  notSent: number
  /** Sets the server refused. */
  refused: number
  /** Sets wait for room under the account's cap. */
  full: boolean
}

/** What a lift is called on the page and in its focus lookups: its name and equipment. */
export function liftId(lift: Pick<LiftOfDay, 'name' | 'equipment'>): string {
  return `${lift.name}|${lift.equipment}`
}
