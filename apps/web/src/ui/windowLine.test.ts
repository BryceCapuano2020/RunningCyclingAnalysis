import { describe, expect, it } from 'vitest'
import type { AnswerWindow, PassedWindow } from '@rca/core/answer'
import { windowFacts } from './windowLine'

const passed = (days: number, ...lacks: PassedWindow['lacks']): PassedWindow => ({ days, lacks })

describe('windowFacts', () => {
  it('says nothing for a pick, or when the first window was taken', () => {
    expect(windowFacts({ choice: 42, reason: 'asked', passed: [] })).toBeNull()
    expect(
      windowFacts({
        choice: { from: '2026-01-01', to: '2026-02-01' },
        reason: 'asked',
        passed: [],
      }),
    ).toBeNull()
    expect(windowFacts({ choice: 84, reason: 'qualified', passed: [] })).toBeNull()
    expect(windowFacts({ choice: 84, reason: 'most', passed: [] })).toBeNull()
    expect(windowFacts({ choice: 'all', reason: 'qualified', passed: [] })).toBeNull()
  })

  it('names why the shortest window was passed over, and not the window the page uses', () => {
    const window: AnswerWindow = {
      choice: 365,
      reason: 'qualified',
      passed: [
        passed(84, { sport: 'run', lack: 'easy' }),
        passed(182, { sport: 'run', lack: 'easy' }),
      ],
    }
    expect(windowFacts(window)).toEqual({ length: '12 weeks', lacked: 'no hard runs' })
    // The window the page uses is the lit segment of the control, so the line is the same for any window.
    expect(windowFacts({ ...window, choice: 182, passed: [window.passed[0]!] })).toEqual({
      length: '12 weeks',
      lacked: 'no hard runs',
    })
  })

  it('names what each sport lacked: activities, a 20 min best, a hard best', () => {
    const line = (...lacks: PassedWindow['lacks']) =>
      windowFacts({ choice: 182, reason: 'qualified', passed: [passed(84, ...lacks)] })
    expect(line({ sport: 'ride', lack: 'few' })).toEqual({
      length: '12 weeks',
      lacked: 'too few rides',
    })
    expect(line({ sport: 'run', lack: 'none' })).toEqual({
      length: '12 weeks',
      lacked: 'no 20 min runs',
    })
    expect(line({ sport: 'run', lack: 'easy' }, { sport: 'ride', lack: 'few' })).toEqual({
      length: '12 weeks',
      lacked: 'no hard runs and too few rides',
    })
    // Sports that lacked the same thing share a clause, and every sport lacking it needs no list of them.
    expect(line({ sport: 'run', lack: 'easy' }, { sport: 'ride', lack: 'easy' })).toEqual({
      length: '12 weeks',
      lacked: 'no hard efforts',
    })
    expect(line({ sport: 'run', lack: 'few' }, { sport: 'ride', lack: 'few' })).toEqual({
      length: '12 weeks',
      lacked: 'too few activities',
    })
  })

  it('says the same for all time, which the control lights as All', () => {
    expect(
      windowFacts({
        choice: 'all',
        reason: 'all-time',
        passed: [84, 182, 365].map((days) => passed(days, { sport: 'ride', lack: 'few' })),
      }),
    ).toEqual({ length: '12 weeks', lacked: 'too few rides' })
  })
})
