// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { AnalysisResult } from '@rca/core/pipeline'
import { wordsOf } from '../../test/wordsOf'
import { MAN_BORN_1986, makeResult } from '../components/fixtures'
import type { AgeProfile } from '../grades'
import { MethodPage } from './MethodPage'

afterEach(cleanup)

function page(result: AnalysisResult | null, profile: AgeProfile | null, weightKnown = true) {
  return (
    <MethodPage
      result={result}
      heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
      profile={profile}
      weightKnown={weightKnown}
      restoring={false}
    />
  )
}

/** The most words the page may hold with every disclosure closed. */
const BUDGET = 2145

describe('the Method page', () => {
  it('stays within its word budget', () => {
    const { container } = render(page(makeResult(), MAN_BORN_1986))
    // Measured with every disclosure closed: 2,046 words before D4.10's trim, 2,010 after; the Your years topic (#311) has since added 15, so 2,025. V2e writes one fact a line and moves the zone schemes, the curve starts and the tie-break into More detail, which leaves 2,024. One How this works list says each idea once, and its small details are plain lines, which leaves 2,017. The threshold entry says a ride’s method and drops the rule that a best that was not hard set a floor, which leaves 2,007. The run threshold is said as the ride's is, one line for each in place of the critical-speed fit and its floor, which leaves 2,000. The heart-rate line names the ride and the run line drops "built the same way", which leaves 1,999. Grading each sport against its own best says the anchor in three lines and drops the equal-energy ones, which leaves 1,998. The detail panels move the prose out of the app views onto this page: the heart-rate reasons add 18, which leaves 2,016. The fitness status entry takes the evidence panel's method prose, the steady-activity rules and the false-alarm rate, which, with the race lines in its detail, leaves 2,142.
    expect(wordsOf(container).length).toBeLessThanOrEqual(BUDGET)
  })
})

/** The most words a sentence on the page may hold. */
const MAX_SENTENCE_WORDS = 25

/** A sentence ends at a full stop followed by a space; a line may hold a decimal point or an initial. */
const SENTENCE_END = /(?<=[a-z)%\]”])\. (?=[A-Z“])/

/** Every sentence of text the page shows or holds behind a disclosure, outside its charts and its contents. */
function sentencesOf(container: HTMLElement): string[] {
  const blocks = Array.from(container.querySelectorAll('p, li, dt, h2, h3'))
    .filter((node) => !node.closest('nav, figure'))
    .flatMap((node) => {
      // A paragraph of method lines is read one line at a time; a line is one sentence.
      const lines = Array.from(node.querySelectorAll(':scope > .method__line'))
      return lines.length > 0
        ? lines.map((line) => line.textContent ?? '')
        : [node.textContent ?? '']
    })
  return blocks.flatMap((text) => text.trim().split(SENTENCE_END)).filter((text) => text.length > 0)
}

describe('the Method page sentences', () => {
  it.each([
    ['a graded library', () => page(makeResult(), MAN_BORN_1986)],
    ['a library with no weight', () => page(makeResult(), MAN_BORN_1986, false)],
    ['no files', () => page(null, null)],
  ])('keeps every sentence to 25 words or fewer for %s', async (_name, build) => {
    const { container } = render(build())

    const sentences = sentencesOf(container)
    expect(sentences.length).toBeGreaterThan(100)
    const long = sentences.filter((sentence) => sentence.split(/\s+/).length > MAX_SENTENCE_WORDS)
    expect(long).toEqual([])
  })
})
