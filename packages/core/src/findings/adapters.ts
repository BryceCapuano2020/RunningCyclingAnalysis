import type { Sport } from '../types'

/** How each sport is named in copy, so no code branches on the sport. */
export const SPORT_ADAPTERS: Record<Sport, { noun: string; nounPlural: string }> = {
  run: { noun: 'run', nounPlural: 'runs' },
  ride: { noun: 'ride', nounPlural: 'rides' },
}
