import type { Sport } from '@rca/core/types'
import { SPORT_LABEL } from './sports'

/** A threshold's name wherever it is a title: the sport and what the figure is. Balance's tiles and the share card read it. */
export const THRESHOLD_NAME: Record<Sport, string> = {
  run: `${SPORT_LABEL.run} threshold`,
  ride: `${SPORT_LABEL.ride} threshold`,
}
