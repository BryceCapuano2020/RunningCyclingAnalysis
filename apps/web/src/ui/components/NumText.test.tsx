// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NumText } from './NumText'

afterEach(cleanup)

/** The figures a sentence sets in the mono, in order. */
function figuresOf(text: string): string[] {
  const { container } = render(
    <p>
      <NumText text={text} />
    </p>,
  )
  return Array.from(container.querySelectorAll('.num')).map((num) => num.textContent ?? '')
}

describe('NumText', () => {
  it('sets each number in a sentence in the mono, and leaves the words as they are', () => {
    const { container } = render(
      <p>
        <NumText text="Up 9% (5 to 13) from your 2023 low." />
      </p>,
    )
    expect(container).toHaveTextContent('Up 9% (5 to 13) from your 2023 low.')
    expect(Array.from(container.querySelectorAll('.num')).map((num) => num.textContent)).toEqual([
      '9',
      '5',
      '13',
      '2023',
    ])
  })

  it('sets a day as one figure, with or without its year', () => {
    expect(figuresOf('You ran 19:40 on 27 Nov 2025')).toEqual(['19:40', '27 Nov 2025'])
    expect(figuresOf('From 6 steady runs, 3 Oct to 23 Oct.')).toEqual(['6', '3 Oct', '23 Oct'])
  })

  it('keeps a time, a sign and separators inside one figure', () => {
    expect(figuresOf('0:35 /mi faster, 1,234.5 W, −5 to +24')).toEqual([
      '0:35',
      '1,234.5',
      '−5',
      '+24',
    ])
  })
})
