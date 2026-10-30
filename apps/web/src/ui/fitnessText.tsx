import type { ReactNode } from 'react'
import { FITNESS } from '@rca/core/fitness'
import type { FitnessStatus } from '@rca/core/fitness'
import { Definition } from './components/Definition'
import { DEFINITIONS } from './pages/balanceDefinitions'
import { FITNESS_WORDS } from './fitnessModel'

const U = FITNESS.unit

/**
 * What the terms that carry a fitness answer mean, in words short enough for a note beside the term. The
 * numbers are read from the table the analysis reads, so the note cannot drift from what is measured.
 */
export function fitnessDefinitions(status: FitnessStatus) {
  const hr = status.referenceHr
  const words = FITNESS_WORDS[status.sport]
  return {
    sameHeartRate: `Your ${words.output.toLowerCase()} is read at one heart rate, ${hr} bpm, so a hard day does not look like fitness. It is the heart rate your steady kilometres most often sit at, to the nearest ${U.referenceStepBpm} bpm.`,
    steadyRun: `A run outdoors with heart rate on file, where pace changes by about ${Math.round(U.maxPaceChange * 100)}% or less from one kilometre to the next. Kilometres ${U.firstKm + 1} to ${U.lastKm + 1} are read: the ones within ${U.hrHalfBand} bpm of ${hr} bpm and with little climb, at least ${U.minKm} of them. Intervals, hilly runs and treadmill runs do not count.`,
    range: DEFINITIONS.range90,
  }
}

interface Rule {
  pattern: RegExp
  meaning: string
}

/**
 * A sentence from the analysis with its terms defined in place: the heart rate it is read at, a range and
 * "steady run", the first of each. Text that has none of them comes back as it is.
 */
export function withDefinitions(text: string, status: FitnessStatus): ReactNode {
  const meaning = fitnessDefinitions(status)
  const rules: Rule[] = [
    { pattern: /^At \d+ bpm/, meaning: meaning.sameHeartRate },
    { pattern: /\(\d+(?:\.\d)?(?: to \d+(?:\.\d)?)?%\)/, meaning: meaning.range },
    { pattern: /steady (?:runs?|rides?)/, meaning: meaning.steadyRun },
  ]
  const found = rules
    .flatMap((rule) => {
      const match = rule.pattern.exec(text)
      return match === null
        ? []
        : [{ start: match.index, end: match.index + match[0].length, text: match[0], rule }]
    })
    .sort((a, b) => a.start - b.start)
  const nodes: ReactNode[] = []
  let at = 0
  for (const piece of found) {
    if (piece.start < at) continue
    nodes.push(text.slice(at, piece.start))
    nodes.push(
      <Definition key={piece.start} meaning={piece.rule.meaning}>
        {piece.text}
      </Definition>,
    )
    at = piece.end
  }
  nodes.push(text.slice(at))
  return nodes
}
