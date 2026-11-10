// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { AnalysisResult } from '@rca/core/pipeline'
import { wordsOf } from '../../test/wordsOf'
import { MAN_BORN_1986, makeResult } from '../components/test/fixtures'
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
const BUDGET = 1340

describe('the Method page', () => {
  it('stays within its word budget', () => {
    const { container } = render(page(makeResult(), MAN_BORN_1986))
    // Measured with every disclosure closed: 2,342 words before the rewrite, 3,822 with every disclosure open. The rewrite
    // leads each section with one line and lists its facts, and leaves 1,333.
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
