import { createContext, useContext } from 'react'
import type { HoldInputs } from './resultHold'

/**
 * What the app knows that can hold results, from outside any one result: the library's held-out digests today,
 * the partial import when it is fed. The app provides it once, so Balance, the Method page and the share card read
 * the same hold without each being handed it. What a page adds from the ride's own grade (`rideHoldInputs`) goes on
 * top of it where the page reads the hold.
 */
export const HoldInputsContext = createContext<HoldInputs>({})

export function useHoldInputs(): HoldInputs {
  return useContext(HoldInputsContext)
}
