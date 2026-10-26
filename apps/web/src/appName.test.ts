import { describe, expect, it } from 'vitest'
import { APP_NAME, APP_WORDS } from './appName'

describe('APP_WORDS', () => {
  it('spells the name in words, one for each capital', () => {
    expect(APP_WORDS).toBe('Running Cycling Analysis')
  })

  it('is the same name, only with spaces at its word breaks', () => {
    expect(APP_WORDS.replace(/ /g, '')).toBe(APP_NAME)
  })
})
