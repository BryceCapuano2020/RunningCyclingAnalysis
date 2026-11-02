import { describe, expect, it } from 'vitest'
import { TOPICS } from './methodTopics'

/** Every line a topic holds: its plain lines, then its detail lines. */
const linesOf = (topic: (typeof TOPICS)[number]) => [...topic.plain, ...(topic.detail ?? [])]

describe('How sure is this? copy', () => {
  it('calls sensor readings implausible, never impossible', () => {
    const copy = TOPICS.flatMap(linesOf).join(' ')
    expect(copy).not.toMatch(/impossible/)
    expect(copy).toMatch(/implausible readings/)
  })

  it('says running bests start at 5 minutes and the running curve at 3, and why', () => {
    const lines = TOPICS.flatMap(linesOf)
    expect(lines).toContain('Running bests by time start at 5 min and the running curve at 3 min.')
    expect(lines).toContain(
      'Shorter slope-adjusted windows mostly measure the slope reading, so they say little about the runner.',
    )
  })

  it('gives every line one sentence, so each line holds one fact', () => {
    for (const topic of TOPICS) {
      for (const line of linesOf(topic)) {
        // A sentence ends at a full stop followed by a space; a line may hold a decimal point or an initial.
        expect(line.split(/(?<=[a-z)%\]])\. (?=[A-Z])/).length, line).toBe(1)
      }
    }
  })

  it('writes the default period as the shortest window every sport qualifies in, with the picked period never searched', () => {
    const period = TOPICS.find((topic) => topic.id === 'period')
    expect(period?.plain).toContain(
      'The default period is the shortest window where every sport qualifies.',
    )
    expect(period?.plain).toContain('A period you pick yourself is always used.')
  })

  it('says “at least” on a threshold marks a floor, and a best that was not hard is treated as one', () => {
    const threshold = TOPICS.find((topic) => topic.id === 'threshold')
    expect(threshold?.plain).toContain('“At least” before a threshold marks a floor.')
    expect(threshold?.plain).toContain('A 20 min best that was not hard does not set a threshold.')
    expect(threshold?.plain).toContain(
      'A best that was not hard is a floor, so real ability is at least that.',
    )
  })
})
