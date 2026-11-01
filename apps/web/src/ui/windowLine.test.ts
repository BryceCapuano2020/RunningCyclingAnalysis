import { describe, expect, it } from 'vitest'
import type { AnswerWindow, PassedWindow } from '@rca/core/answer'
import { windowLine } from './windowLine'

const passed = (days: number, ...lacks: PassedWindow['lacks']): PassedWindow => ({ days, lacks })

describe('windowLine', () => {
  it('says nothing for a pick, or when the first window was taken', () => {
    expect(windowLine({ choice: 42, reason: 'asked', passed: [] })).toBeNull()
    expect(
      windowLine({ choice: { from: '2026-01-01', to: '2026-02-01' }, reason: 'asked', passed: [] }),
    ).toBeNull()
    expect(windowLine({ choice: 84, reason: 'qualified', passed: [] })).toBeNull()
    expect(windowLine({ choice: 84, reason: 'most', passed: [] })).toBeNull()
    expect(windowLine({ choice: 'all', reason: 'qualified', passed: [] })).toBeNull()
  })

  it('names the window and why the shortest was passed over', () => {
    const window: AnswerWindow = {
      choice: 365,
      reason: 'qualified',
      passed: [
        passed(84, { sport: 'run', lack: 'easy' }),
        passed(182, { sport: 'run', lack: 'easy' }),
      ],
    }
    expect(windowLine(window)).toBe('Last 12 weeks had no hard runs, so this uses 12 months.')
    expect(windowLine({ ...window, choice: 182, passed: [window.passed[0]!] })).toBe(
      'Last 12 weeks had no hard runs, so this uses 6 months.',
    )
  })

  it('names what each sport lacked: activities, a 20 min best, a hard best', () => {
    const line = (...lacks: PassedWindow['lacks']) =>
      windowLine({ choice: 182, reason: 'qualified', passed: [passed(84, ...lacks)] })
    expect(line({ sport: 'ride', lack: 'few' })).toBe(
      'Last 12 weeks had too few rides, so this uses 6 months.',
    )
    expect(line({ sport: 'run', lack: 'none' })).toBe(
      'Last 12 weeks had no 20 min runs, so this uses 6 months.',
    )
    expect(line({ sport: 'run', lack: 'easy' }, { sport: 'ride', lack: 'few' })).toBe(
      'Last 12 weeks had no hard runs and too few rides, so this uses 6 months.',
    )
    // Sports that lacked the same thing share a clause, and every sport lacking it needs no list of them.
    expect(line({ sport: 'run', lack: 'easy' }, { sport: 'ride', lack: 'easy' })).toBe(
      'Last 12 weeks had no hard efforts, so this uses 6 months.',
    )
    expect(line({ sport: 'run', lack: 'few' }, { sport: 'ride', lack: 'few' })).toBe(
      'Last 12 weeks had too few activities, so this uses 6 months.',
    )
  })

  it('says all time in place of a length', () => {
    expect(
      windowLine({
        choice: 'all',
        reason: 'all-time',
        passed: [84, 182, 365].map((days) => passed(days, { sport: 'ride', lack: 'few' })),
      }),
    ).toBe('Last 12 weeks had too few rides, so this uses all time.')
  })

  it('keeps every sentence short, and free of the words the voice rules ban', () => {
    const lines = (['few', 'none', 'easy'] as const).map((lack) =>
      windowLine({
        choice: 365,
        reason: 'qualified',
        passed: [passed(84, { sport: 'run', lack }, { sport: 'ride', lack })],
      })!,
    )
    for (const line of lines) {
      for (const sentence of line.split('. ')) {
        expect(sentence.split(' ').length).toBeLessThanOrEqual(13)
      }
      expect(line).not.toMatch(/—|because|honest|comparable|reference|shown/i)
    }
  })
})
