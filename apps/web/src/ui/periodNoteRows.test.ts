import { describe, expect, it } from 'vitest'
import { NO_WINDOW } from '@rca/core/answer'
import type { AnswerWindow } from '@rca/core/answer'
import type { Period } from '@rca/core/period'
import { periodNoteRows } from './periodNoteRows'

const DAY = 86_400_000
const NOW = Date.now()

const PERIOD: Period = { choice: 365, startMs: null, endMs: null, days: 365, fellBack: false }

describe('periodNoteRows', () => {
  it('is empty when nothing about the window needs saying', () => {
    expect(periodNoteRows(NO_WINDOW)).toEqual([])
    expect(
      periodNoteRows(NO_WINDOW, {
        activities: [{ startMs: NOW - 10 * DAY }, { startMs: NOW - 400 * DAY }],
        period: { ...PERIOD, days: 42, choice: 42 },
        newestMs: NOW - 10 * DAY,
      }),
    ).toEqual([])
  })

  it('says why the default passed over a shorter window as a label and a few words', () => {
    const window: AnswerWindow = {
      choice: 182,
      reason: 'qualified',
      passed: [{ days: 84, lacks: [{ sport: 'ride', lack: 'few' }] }],
    }
    expect(periodNoteRows(window)).toEqual([{ label: 'Last 12 weeks', value: 'Too few rides' }])
  })

  it('gives the newest activity’s age and the shorter period it repeats, each a row', () => {
    const newest = NOW - 300 * DAY
    const rows = periodNoteRows(NO_WINDOW, {
      activities: [{ startMs: newest }],
      period: PERIOD,
      newestMs: newest,
    })
    expect(rows).toEqual([
      { label: 'Same activities as', value: '6 weeks to latest' },
      { label: 'Latest activity', value: expect.stringMatching(/ago$/) },
    ])
  })
})
