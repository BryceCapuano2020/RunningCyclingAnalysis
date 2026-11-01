import { orderedFor } from '../digest/consumers'
import { memoByDigests } from '../digestMemo'
import type { ActivityDigest } from '../types'
import * as PARTS from './parts'
import type { HistoryInput, HistoryPart } from './types'

type Parts = typeof PARTS
type AnswerOf<P> = P extends HistoryPart<infer T> ? T : never

/** The whole library's history for the History page: one entry for each part in parts.ts, by its name. */
export type History = { readonly [K in keyof Parts]: AnswerOf<Parts[K]> }

const ENTRIES: [string, HistoryPart<unknown>][] = Object.entries(PARTS)

/** Nothing to say: no library. */
export const NO_HISTORY = Object.fromEntries(
  ENTRIES.map(([name, part]) => [name, part.empty]),
) as History

/** Each part remembers its own last answers, so a setting that one part reads does not redo the others. */
const REMEMBERED = ENTRIES.map(
  ([name, part]) => [name, memoByDigests(part.build, part.same)] as const,
)

/**
 * The library's history: for each part, its answer over every analysed digest, whatever period is picked. It is a
 * function of the digests and of what the parts read of `input`, and remembered for the same digests, so a change of
 * period costs nothing. Pass the digests the analysis reads (hidden copies and left-out activities are out already).
 */
export function historyOf(digests: ActivityDigest[], input: HistoryInput): History {
  const readable = orderedFor('history', digests)
  return Object.fromEntries(
    REMEMBERED.map(([name, remember]) => [name, remember(readable, input)]),
  ) as History
}
