import { describe, expect, it } from 'vitest'
import { inSentence, withThe } from './previousLabel'

describe('the label of what a period is compared with', () => {
  it('reads "previous 12 weeks" in a sentence, with "the" where a period takes it', () => {
    expect(inSentence('Previous 12 weeks')).toBe('previous 12 weeks')
    expect(withThe('Previous 6 months')).toBe('the previous 6 months')
  })

  it('leaves a window named by its months as it is', () => {
    expect(inSentence('Jan to Mar')).toBe('Jan to Mar')
    expect(withThe('Nov 2024 to Jan 2025')).toBe('Nov 2024 to Jan 2025')
  })
})
