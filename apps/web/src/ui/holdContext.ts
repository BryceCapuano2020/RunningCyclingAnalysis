import { createContext, useContext } from 'react'
import type { HoldInputs } from './resultHold'

/**
 * What the app knows that can hold results, from outside any one result: the library's held-out digests today,
 * the partial import and the implausible ride when they are fed. The app provides it once, so Balance, the Method
 * page and the share card read the same hold without each being handed it.
 */
export const HoldInputsContext = createContext<HoldInputs>({})

export function useHoldInputs(): HoldInputs {
  return useContext(HoldInputsContext)
}
