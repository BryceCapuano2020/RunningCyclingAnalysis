import type { LiftSet } from '@rca/core/lift'
import { LiftTransportError } from './liftTransport'
import type { LiftPageAnswer, LiftPutAnswer, LiftTransport } from './liftTransport'

/** A synthetic set: one lift on one date, so `setOrder` alone tells sets apart. */
export const make = (setOrder: number, loadKg = 60): LiftSet => ({
  date: '2031-01-05',
  exercise: 'squat',
  equipment: 'barbell',
  setOrder,
  reps: 5,
  loadKg,
})

export type Call =
  | { type: 'put'; orders: number[]; insertOnly: boolean }
  | { type: 'remove'; keys: string[] }
  | { type: 'page'; cursor: string | null }

/** A transport that records its calls and answers from scripts; `reply` runs before each answer. */
export function fakeTransport(script: {
  put?: (sets: readonly LiftSet[], call: number) => LiftPutAnswer | LiftTransportError
  remove?: (keys: readonly string[]) => { liftRevision: number } | LiftTransportError
  pages?: (cursor: string | null) => LiftPageAnswer
  gate?: () => Promise<void>
}) {
  const calls: Call[] = []
  let inFlight = 0
  let overlapped = false
  const run = async <T>(answer: () => T | LiftTransportError): Promise<T> => {
    inFlight++
    if (inFlight > 1) overlapped = true
    try {
      await script.gate?.()
      const out = answer()
      if (out instanceof LiftTransportError) throw out
      return out
    } finally {
      inFlight--
    }
  }
  const transport: LiftTransport = {
    put: (sets, options) => {
      calls.push({
        type: 'put',
        orders: sets.map((s) => s.setOrder),
        insertOnly: options?.insertOnly === true,
      })
      return run(() => script.put?.(sets, calls.length) ?? { liftRevision: 1 })
    },
    remove: (keys) => {
      calls.push({ type: 'remove', keys: [...keys] })
      return run(() => script.remove?.(keys) ?? { liftRevision: 1 })
    },
    page: (cursor) => {
      calls.push({ type: 'page', cursor })
      return run(() => script.pages?.(cursor) ?? { items: [], next: null, liftRevision: 1 })
    },
  }
  return { transport, calls, overlapped: () => overlapped }
}
