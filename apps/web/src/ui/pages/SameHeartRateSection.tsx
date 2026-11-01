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

/** Under the chart: how a dot is made and what it counts, and when the weeks are the library's, that they are. */
function noteFor(sport: Sport, data: SameHeartRate): string {
  const { windowDays, wideWindowDays } = SAME_HEART_RATE
  const window = plural(windowDays / 7, 'week')
  const wide = plural(wideWindowDays / 7, 'week')
  const scope = data.scope === 'library' ? ' These are your newest weeks, whatever the period.' : ''
  return `Each dot is fitted to the steady 5-minute stretches of the ${window} to that Sunday. A quiet stretch reaches back ${wide}. ${COUNTS[sport]}${scope}`
}

/**
 * A sport's output at one heart rate, week by week: a dot for each week that reports. It claims no change: the
 * windows of neighbouring weeks overlap and the level wanders, so a line fitted through the dots reads that as a trend.
 * The fitness status is the sport's voice on change. With too little data to draw it has no section:
 * sameHeartRateLack says what is missing.
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
  if (data.reportedWeeks < 2) return null
  return <SameHeartRateChart sport={sport} data={data} units={units} note={noteFor(sport, data)} />
}
