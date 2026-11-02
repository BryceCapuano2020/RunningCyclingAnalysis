import { describe, expect, it } from 'vitest'
import { TOPICS } from './methodTopics'

/** Every line a topic holds: its plain lines, then its detail lines. */
const linesOf = (topic: (typeof TOPICS)[number]) => [...topic.plain, ...(topic.detail ?? [])]

describe('the topics that sit beside a chart', () => {
  it('are the four with a section of their own: the unit, the range, the heart-rate check and virtual power', () => {
    expect(TOPICS.map((topic) => topic.id)).toEqual(['unit', 'range', 'heart', 'virtual'])
  })

  it('gives every line one sentence of 25 words or fewer, so each line holds one fact', () => {
    for (const topic of TOPICS) {
      for (const line of linesOf(topic)) {
        // A sentence ends at a full stop followed by a space; a line may hold a decimal point or an initial.
        expect(line.split(/(?<=[a-z)%\]])\. (?=[A-Z])/).length, line).toBe(1)
        expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25)
      }
    }
  })

  it('does not say again what How this works says: the threshold’s range and the race ranges', () => {
    const range = TOPICS.find((topic) => topic.id === 'range')
    const copy = linesOf(range!).join(' ')
    expect(copy).not.toMatch(/standard error|allowance|marathon|drawn lighter/)
    expect(range?.detail).toContain(
      'A threshold and a race prediction each have a range of their own.',
    )
  })
})
