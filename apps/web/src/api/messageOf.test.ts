import { describe, expect, it } from 'vitest'
import { messageOf } from './messageOf'

describe('messageOf', () => {
  it('reads the message of an error', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf(new Error('boom'), 'Try again.')).toBe('boom')
  })

  it('writes out anything else, or says the fallback when there is one', () => {
    expect(messageOf(404)).toBe('404')
    expect(messageOf('offline')).toBe('offline')
    expect(messageOf('offline', 'Try again.')).toBe('Try again.')
  })
})
