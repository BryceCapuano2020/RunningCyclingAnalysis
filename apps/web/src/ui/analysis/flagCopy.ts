import type { QualityFlag } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { plural } from '../components/plural'

/**
 * The data-quality flags of an activity, in the words the activity page shows. The core gives each a
 * kind and a span in seconds; this is the one place that says what a kind means to the athlete.
 */

type FlagSpan = Pick<QualityFlag, 'kind' | 'start' | 'end'>

/** m:ss, or h:mm:ss from an hour, for a point in the activity. */
function clockText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

/** "from 37:41 to 40:19. We left those 2 min 38 s out." */
function spanText(start: number, end: number): string {
  return `from ${clockText(start)} to ${clockText(end)}`
}

function leftOut({ start, end }: FlagSpan): string {
  return `We left those ${formatDuration(end - start)} out.`
}

/** The sentence for one data issue. Sensor problems say what was left out of the figures. */
export function flagSentence(flag: FlagSpan): string {
  const span = spanText(flag.start, flag.end)
  switch (flag.kind) {
    case 'hr-implausible-for-power':
      return `Heart rate looked too low for your power ${span}. ${leftOut(flag)}`
    case 'hr-dropout':
      return `Heart rate was missing or too low while moving ${span}. ${leftOut(flag)}`
    case 'hr-spike':
      return `Heart rate jumped to an impossible value ${span}. ${leftOut(flag)}`
    case 'power-spike':
      return `The power meter reported an impossible spike ${span}. ${leftOut(flag)}`
    case 'power-dropout':
      return `The power meter stopped reporting while moving ${span}. ${leftOut(flag)}`
    case 'speed-spike':
      return `GPS speed jumped to an impossible value ${span}. ${leftOut(flag)}`
    case 'altitude-jump':
      return `Altitude jumped in a single second at ${clockText(flag.start)}.`
    case 'missing-altitude':
      return `No altitude was recorded ${span}, so grade-based figures for that stretch are not used.`
  }
}

/** The count a page shows for readings left out of its figures. */
export function skippedReadingsText(count: number): string {
  return `${plural(count, 'reading')} skipped`
}
