import type { AnswerWindow, Lack } from '@rca/core/answer'
import type { Sport } from '@rca/core/types'
import { lengthOf } from './components/rangeOptions'
import { HEADLINE_LABEL } from './grades'
import { BALANCE_PAIR, SPORT_PLURAL } from './sports'

/** What every sport lacked, as one word, where naming each sport would only lengthen the line. */
const EVERY_SPORT: Record<Lack, string> = { few: 'activities', none: 'efforts', easy: 'efforts' }

/** The sports' activities as one phrase: "runs", "runs or rides". */
function nouns(sports: readonly Sport[]): string {
  return sports.map((sport) => SPORT_PLURAL[sport]).join(' or ')
}

/** What sports lacked in a window the default passed over, as it follows "had": "too few rides", "no hard efforts". */
const LACK_WORDS: Record<Lack, (what: string) => string> = {
  few: (what) => `too few ${what}`,
  none: (what) => `no ${HEADLINE_LABEL} ${what}`,
  easy: (what) => `no hard ${what}`,
}

/**
 * The line under the period control when the default is not the 12 weeks it starts from: why the shortest window was
 * passed over, then the window the page is on. "Last 12 weeks had no hard runs, so this uses 12 months." Null when the
 * athlete picked the period, or the first window was taken.
 */
export function windowLine({ choice, passed }: AnswerWindow): string | null {
  const [shortest] = passed
  if (shortest === undefined || typeof choice === 'object') return null
  const uses = choice === 'all' ? 'all time' : lengthOf(choice)
  // Sports that lacked the same thing share a clause, so the line stays one short sentence.
  const kinds = [...new Set(shortest.lacks.map(({ lack }) => lack))]
  const lacked = kinds
    .map((kind) => {
      const sports = shortest.lacks.filter(({ lack }) => lack === kind).map(({ sport }) => sport)
      return LACK_WORDS[kind](
        sports.length === BALANCE_PAIR.length ? EVERY_SPORT[kind] : nouns(sports),
      )
    })
    .join(' and ')
  return `Last ${lengthOf(shortest.days)} had ${lacked}, so this uses ${uses}.`
}
