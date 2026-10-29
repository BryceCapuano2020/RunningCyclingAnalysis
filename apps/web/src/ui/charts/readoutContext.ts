import { createContext } from 'react'

/**
 * Where a phone's scrub readout goes: the fixed row ChartFrame keeps above the plot. A tooltip finds it here
 * and draws into it instead of floating over the plot, which a finger would cover. Null on a wide chart, and
 * for a tooltip drawn outside a frame, which stays where it is.
 */
export const ReadoutContext = createContext<HTMLElement | null>(null)
