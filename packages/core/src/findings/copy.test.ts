import { describe, expect, it } from 'vitest'
import {
  assertCleanCopy,
  copyOf,
  counted,
  factText,
  formatBpm,
  formatDay,
  formatRelative,
  likelyExplanation,
  lintCopy,
  lintFinding,
  magnitude,
  sideWord,
  weeksBetween,
} from './copy'

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

  it('lints everything a finding carries, composed as shown, not only the headline', () => {
    const clean = {
      headline: 'At 145 bpm you now run 5:52 /km.',
      numbers: [{ key: 'pace', value: 352, unit: 's/km' }],
      method: { test: 'fit against fit', n: 12, exclusions: ['indoor runs'] },
    }
    expect(lintFinding(clean)).toEqual([])
    expect(copyOf(clean)).toEqual([
      'At 145 bpm you now run 5:52 /km.',
      'fit against fit',
      'indoor runs',
      'pace',
      's/km',
    ])
    const withCause = {
      ...clean,
      likelyCause: { text: 'weekly time rose first.', signals: ['volume-step'] },
    }
    expect(copyOf(withCause)).toContain('Likely explanation, not proof: weekly time rose first.')
    expect(copyOf(withCause)).toContain('volume-step')
    expect(lintFinding(withCause)).toEqual([])
    const dirty = [
      { ...clean, method: { ...clean.method, test: 'due to a limiter' } },
      { ...clean, method: { ...clean.method, exclusions: ['weak signal'] } },
      { ...clean, numbers: [{ key: 'strength', value: 1, unit: '' }] },
      { ...clean, numbers: [{ key: 'k', value: 1, unit: 'ahead' }] },
      { ...withCause, likelyCause: { text: 'it led to more.', signals: [] } },
      { ...withCause, likelyCause: { text: 'rest.', signals: ['because'] } },
    ]
    for (const finding of dirty) expect(lintFinding(finding).length).toBeGreaterThan(0)
  })

  it('throws from assertCleanCopy with the offending words', () => {
    expect(() => assertCleanCopy('Your limiter')).toThrow(/limiter/)
    expect(() => assertCleanCopy('Your pace')).not.toThrow()
  })
})

describe('copy helpers', () => {
  it('counts with the noun in its right number and groups thousands', () => {
    expect(counted(1, 'run')).toBe('1 run')
    expect(counted(14, 'run')).toBe('14 runs')
    expect(counted(1234, 'activity', 'activities')).toBe('1,234 activities')
  })

  it('writes sizes without a sign, so the side is a word', () => {
    expect(formatBpm(147.6)).toBe('148 bpm')
    expect(magnitude(-5.2, 'bpm')).toBe('5 bpm')
    expect(magnitude(-2.46, '%', 1)).toBe('2.5%')
    expect(formatRelative(-0.025)).toBe('2.5%')
    expect(formatRelative(0.18)).toBe('18%')
    expect(sideWord(-1, { up: 'faster', down: 'slower' })).toBe('slower')
    expect(sideWord(0, { up: 'faster', down: 'slower' })).toBe('faster')
  })

  it('writes days in UTC and spans in whole weeks', () => {
    expect(formatDay(Date.UTC(2026, 9, 21, 23, 59))).toBe('21 Oct')
    expect(weeksBetween(Date.UTC(2026, 8, 2), Date.UTC(2026, 9, 28))).toBe('8 weeks')
    expect(weeksBetween(0, 7 * 86_400_000)).toBe('1 week')
  })

  it('marks an explanation as a likely one and writes a fact with its interval', () => {
    expect(likelyExplanation('your weekly time rose first.')).toBe(
      'Likely explanation, not proof: your weekly time rose first.',
    )
    expect(factText({ key: 'k', value: 148.2, unit: 'bpm' })).toBe('148')
    expect(factText({ key: 'k', value: 1480.2, unit: 'bpm', low: 1400, high: 1500 })).toBe(
      '1,480 (1,400 to 1,500)',
    )
    expect(factText({ key: 'k', value: 0.0251, unit: '', low: 0.01, high: 0.04 }, 3)).toBe(
      '0.025 (0.010 to 0.040)',
    )
  })
})
