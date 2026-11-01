import type { AnswerWindow, Lack } from '@rca/core/answer'
import type { Sport } from '@rca/core/types'
import { lengthOf, periodName } from './components/rangeOptions'
import { HEADLINE_LABEL } from './grades'
import { SPORT_PLURAL } from './sports'

/** What sports lacked in a window the default passed over, as it follows "had": "too few rides", "no hard runs or rides". */
const LACK_WORDS: Record<Lack, (sports: readonly Sport[]) => string> = {
  few: (sports) => `too few ${nouns(sports)}`,
  none: (sports) => `no ${HEADLINE_LABEL} ${nouns(sports)}`,
  easy: (sports) => `no hard ${nouns(sports)}`,
}

/** The sports' activities as one phrase: "runs", "runs or rides". */
function nouns(sports: readonly Sport[]): string {
  return sports.map((sport) => SPORT_PLURAL[sport]).join(' or ')
}

/**
 * The line under the period control when the default is not the 12 weeks it starts from: the window the page is on, then why the
 * shortest window was passed over. "Your last 12 months. Your last 12 weeks had no hard runs." Null when the athlete picked the
 * period, or the first window was taken.
 */
export function windowLine({ choice, passed }: AnswerWindow): string | null {
  const [shortest] = passed
  if (shortest === undefined || typeof choice === 'object') return null
  const on = choice === 'all' ? `${periodName(null)}.` : `Your last ${lengthOf(choice)}.`
  // Sports that lacked the same thing share a clause, so the line stays one short sentence.
  const kinds = [...new Set(shortest.lacks.map(({ lack }) => lack))]
  const lacked = kinds
    .map((kind) =>
      LACK_WORDS[kind](
        shortest.lacks.filter(({ lack }) => lack === kind).map(({ sport }) => sport),
      ),
    )
    .join(' and ')
  return `${on} Your last ${lengthOf(shortest.days)} had ${lacked}.`
}
