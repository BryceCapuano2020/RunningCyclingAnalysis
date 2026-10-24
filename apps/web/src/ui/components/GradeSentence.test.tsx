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

  it('keeps each level with its percent, and the range in brackets, on one line', () => {
    const { container } = render(<GradeSentence sport="ride" grade={RIDE} />)
    const unbroken = Array.from(
      container.querySelectorAll('.grade-sentence__unbroken'),
      (part) => part.textContent,
    )
    expect(unbroken).toEqual(['Local · 66%', '(63–69%)'])
  })
})
