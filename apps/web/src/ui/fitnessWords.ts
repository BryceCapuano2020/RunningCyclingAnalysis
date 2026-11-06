import type { Sport } from '@rca/core/types'

/** What the sport's fitness copy says, in one table keyed by sport. */
export interface FitnessWords {
  output: string
  steady: string
  steadyPlural: string
  activity: string
  activities: string
}

export const FITNESS_WORDS: Record<Sport, FitnessWords> = {
  run: {
    output: 'Pace',
    steady: 'steady run',
    steadyPlural: 'steady runs',
    activity: 'run',
    activities: 'runs',
  },
  ride: {
    output: 'Power',
    steady: 'steady ride',
    steadyPlural: 'steady rides',
    activity: 'ride',
    activities: 'rides',
  },
}

/** What a library's one sport needs before it has a fitness status at all, said as a line when the page has no card to show. */
export const FITNESS_LACK_LINE: Record<Sport, string> = {
  run: 'Fitness needs heart rate. Add runs recorded with a strap or watch.',
  ride: 'Fitness needs power. Add rides recorded with a power meter.',
}

/**
 * The same line for a library whose every activity of the sport was indoors, where the fitness reading skips them (it reads
 * a run's kilometre splits, and a treadmill's belt speed is not a distance covered): it asks for outdoor ones.
 */
export const FITNESS_LACK_INDOOR_LINE: Partial<Record<Sport, string>> = {
  run: 'Fitness skips treadmill runs. Add runs recorded outdoors with a strap or watch.',
}
