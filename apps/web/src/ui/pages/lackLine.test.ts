import { describe, expect, it } from 'vitest'
import { lackLine } from './lackLine'

describe('lackLine', () => {
  it('names the section, lower-cases the need and ends it with a full stop', () => {
    expect(lackLine('Race predictions', 'Needs a best of a mile or more')).toBe(
      'Race predictions: needs a best of a mile or more.',
    )
  })

  it('does not double a full stop the need already has', () => {
    expect(
      lackLine('At the same heart rate', 'Needs 4 weeks of steady efforts. Pick longer.'),
    ).toBe('At the same heart rate: needs 4 weeks of steady efforts. Pick longer.')
  })
})
