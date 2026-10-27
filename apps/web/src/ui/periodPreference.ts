import { useCallback, useState } from 'react'
import type { PeriodChoice } from '@rca/core/period'
import { RANGE_OPTIONS } from './components/rangeOptions'
/** Where the period picked on this device is kept. Exported so the tests read the same key. */
export const PERIOD_KEY = 'rca.period.v1'

/**
 * The period the athlete last picked on this device. Nothing stored, or a value that is not one of
 * the periods the control offers, is the default: the athlete has picked none.
 */
export function parsePeriodChoice(raw: string | null): PeriodChoice {
  if (raw === null) return 'default'
  try {
    const value: unknown = JSON.parse(raw)
    return RANGE_OPTIONS.find((option) => option.choice === value)?.choice ?? 'default'
  } catch {
    return 'default'
  }
}

/** The period stored on this device: the default when none is stored or storage cannot be read. */
export function storedPeriodChoice(): PeriodChoice {
  try {
    return parsePeriodChoice(localStorage.getItem(PERIOD_KEY))
  } catch {
    return 'default'
  }
}

/** The period on screen, kept on this device once the athlete picks one. */
export function usePeriodChoice(): [PeriodChoice, (choice: PeriodChoice) => void] {
  const [choice, setChoice] = useState<PeriodChoice>(storedPeriodChoice)
  const update = useCallback((next: PeriodChoice) => {
    setChoice(next)
    try {
      localStorage.setItem(PERIOD_KEY, JSON.stringify(next))
    } catch {
      // Storage can be unavailable (private windows); the choice still applies for this visit.
    }
  }, [])
  return [choice, update]
}
