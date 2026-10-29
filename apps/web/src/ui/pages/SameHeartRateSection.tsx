import { SAME_HEART_RATE } from '@rca/core/constants'
import type { SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SameHeartRateChart } from '../charts'
import { plural } from '../components/plural'

/** What each sport's reading counts, since treadmill pace and estimated watts can be what is wrong. */
const COUNTS: Record<Sport, string> = {
  run: 'Counts outdoor runs.',
  ride: 'Counts rides with a power meter.',
}

/**
 * Under the chart: how a dot is made and what it counts, and the limit of the reading. Fatigue can
 * lower heart rate at a given effort (Hammes 2016), so a rise is not always training.
 */
function noteFor(sport: Sport): string {
  const window = plural(SAME_HEART_RATE.windowDays / 7, 'week')
  return `Each dot is fitted to the steady 5-minute stretches of the ${window} to that Sunday. The line is fitted through the dots, and its band is how well the line is pinned down. ${COUNTS[sport]} Fatigue can lower heart rate at a given effort, so a rise can come with fatigue as well as with training.`
}

/**
 * A sport's output at one heart rate, week by week: a fitted trend with its band, and the finding as its title. It says
 * a change only when the first and last weeks' ranges do not overlap. With too little data to draw it has no
 * section: sameHeartRateLack says what is missing.
 */
export function SameHeartRateSection({
  sport,
  data,
  units,
}: {
  sport: Sport
  data: SameHeartRate
  units: UnitSystem
}) {
  if (data.change === null) return null
  return <SameHeartRateChart sport={sport} data={data} units={units} note={noteFor(sport)} />
}
