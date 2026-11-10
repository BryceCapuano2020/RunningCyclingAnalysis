import { describe, expect, it } from 'vitest'
import { counted, formatDay, formatRelative, lintCopy } from './copy'

describe('lintCopy', () => {
  it.each([
    ['Your limiter is climbing.', 'limiter'],
    ['A weak spot on hills.', 'weak'],
    ['Strength on the flat.', 'Strength'],
    ['Strengths and weaknesses.', 'Strength'],
    ['This is holding you back.', 'holding you back'],
    ['You are ahead of most runners.', 'ahead'],
    ['Faster because you trained more.', 'because'],
    ['Training caused the change.', 'caused'],
    ['It causes fade.', 'causes'],
    ['Your grade on hills improved.', 'grade'],
    ['A graded effort.', 'graded'],
    ['Climbing is the limiting factor.', 'limiting factor'],
    ['Hills hold you back.', 'hold you back'],
    ['Heat holds you back.', 'holds you back'],
    ['Holding back on easy days.', 'holding back'],
    ['You are ahead.', 'ahead'],
    ['You are behind last year.', 'behind'],
    ['You outpace the group.', 'outpac'],
    ['Slower due to heat.', 'due to'],
    ['More volume led to more fade.', 'led to'],
    ['A result of more volume.', 'result of'],
    ['It resulted from rest.', 'resulted from'],
    ['A causal link.', 'causal'],
    ['The cause is rest.', 'cause'],
  ])('flags %s', (text, word) => {
    const problems = lintCopy(text)
    expect(problems.some((p) => p.toLowerCase().includes(word.toLowerCase()))).toBe(true)
  })

  it('allows an age grade in either spelling, and the plain words of a finding', () => {
    expect(lintCopy('Your age grade is 71%.')).toEqual([])
    expect(lintCopy('Your age-graded time is 22:10.')).toEqual([])
    expect(
      lintCopy('At 145 bpm you now run 5:52 /km, 18 s/km faster than 8 weeks ago (6:10).'),
    ).toEqual([])
    expect(
      lintCopy('Likely explanation, not proof: your weekly time rose 3 weeks earlier.'),
    ).toEqual([])
  })

  it('does not take words that merely contain a banned one', () => {
    expect(lintCopy('Because')).toHaveLength(1)
    expect(lintCopy('A causeway, a parade of upgrades, a gradient')).toEqual([])
  })
})

describe('copy helpers', () => {
  it('counts with the noun in its right number and groups thousands', () => {
    expect(counted(1, 'run')).toBe('1 run')
    expect(counted(14, 'run')).toBe('14 runs')
    expect(counted(1234, 'activity', 'activities')).toBe('1,234 activities')
  })

  it('writes a relative change without a sign, so the side is a word', () => {
    expect(formatRelative(-0.025)).toBe('2.5%')
    expect(formatRelative(0.18)).toBe('18%')
  })

  it('writes days in UTC', () => {
    expect(formatDay(Date.UTC(2026, 9, 21, 23, 59))).toBe('21 Oct')
  })
})
