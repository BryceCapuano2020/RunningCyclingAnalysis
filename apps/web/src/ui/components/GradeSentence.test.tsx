// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SportGrade } from '../grades'
import { GradeSentence } from './GradeSentence'

afterEach(() => {
  cleanup()
})

const RIDE: SportGrade = {
  centre: { grade: 0.66, level: 'Local' },
  range: {
    low: { grade: 0.63, level: 'Local' },
    high: { grade: 0.69, level: 'Local' },
  },
}

describe('GradeSentence', () => {
  it('reads as the sentence the records and the grade line are written as', () => {
    const { container } = render(<GradeSentence sport="ride" grade={RIDE} where="record" />)
    expect(container.textContent).toBe(
      'Estimated through its running equivalent · Local · 66% (63–69%)',
    )
  })

  it('keeps each percent and its range in brackets on one line, and leaves the level free to wrap', () => {
    const { container } = render(<GradeSentence sport="ride" grade={RIDE} />)
    const unbroken = Array.from(container.querySelectorAll('.grade-sentence__unbroken'), (part) =>
      part.textContent?.trim(),
    )
    expect(unbroken).toEqual(['· 66%', '(63–69%)'])
    expect(container.textContent).toBe('Estimated · Local · 66% (63–69%)')
  })
})
