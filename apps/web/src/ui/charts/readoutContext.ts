import { createContext } from 'react'

/**
 * Where a scrub readout goes: a fixed row above the plot, which a tooltip finds here and draws into instead
 * of floating over the plot, where a finger or a wide readout would cover it. ChartFrame keeps one on a
 * phone and provides it there; the activity timeline keeps one at every width and provides it itself, as five
 * measures at once never fit a tooltip. Null on a wide ChartFrame chart, and for a tooltip drawn outside
 * either, which stays where it is.
 */
export const ReadoutContext = createContext<HTMLElement | null>(null)
