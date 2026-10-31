import { describe, expect, it } from 'vitest'
import { outboxText } from './outboxCopy'

const status = (over: Partial<Parameters<typeof outboxText>[0]>) => ({
  pending: 0,
  saved: 0,
  failed: 0,
  finished: true,
  ...over,
})

describe('outboxText', () => {
  it('says how many are still being saved', () => {
    expect(outboxText(status({ finished: false, pending: 1_204 }))).toBe(
      'Saving 1,204 activities left from your last import…',
    )
    expect(outboxText(status({ finished: false, pending: 1 }))).toBe(
      'Saving 1 activity left from your last import…',
    )
  })

  it('says how many were saved', () => {
    expect(outboxText(status({ saved: 3 }))).toBe('Saved 3 activities from your last import.')
  })

  it('says what could not be saved and what to do about it', () => {
    expect(outboxText(status({ saved: 2, failed: 1 }))).toBe(
      'Saved 2 activities from your last import. 1 activity from your last import could not be saved. Add its file again.',
    )
    expect(outboxText(status({ failed: 4 }))).toContain('Add their files again.')
  })

  it('says what was left for another day', () => {
    expect(outboxText(status({ saved: 1, pending: 5 }))).toBe(
      'Saved 1 activity from your last import. 5 activities are still waiting to be saved. They save automatically.',
    )
  })

  it('has nothing to say when nothing was waiting', () => {
    expect(outboxText(status({}))).toBeNull()
  })
})
