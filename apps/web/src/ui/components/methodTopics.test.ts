import { describe, expect, it } from 'vitest'
import { TOPICS } from './methodTopics'

describe('How sure is this? copy', () => {
  it('calls sensor readings implausible, never impossible', () => {
    const copy = TOPICS.map((topic) => `${topic.plain.join(' ')} ${topic.detail ?? ''}`).join(' ')
    expect(copy).not.toMatch(/impossible/)
    expect(copy).toMatch(/implausible readings/)
  })
})
