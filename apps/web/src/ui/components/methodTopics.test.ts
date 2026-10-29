import { describe, expect, it } from 'vitest'
import { TOPICS } from './methodTopics'

describe('How sure is this? copy', () => {
  it('calls sensor readings implausible, never impossible', () => {
    const copy = TOPICS.map((topic) => `${topic.plain.join(' ')} ${topic.detail ?? ''}`).join(' ')
    expect(copy).not.toMatch(/impossible/)
    expect(copy).toMatch(/implausible readings/)
  })

  it('says running bests start at 5 minutes and the running curve at 3, and why', () => {
    const copy = TOPICS.map((topic) => topic.plain.join(' ')).join(' ')
    expect(copy).toContain(
      'Running bests by time start at 5 min and the running curve at 3 min, because shorter slope-adjusted windows mostly measure the slope reading rather than the runner.',
    )
  })
})
