import { SAME_HEART_RATE } from '@rca/core/constants'
import type { SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SameHeartRateChart } from '../charts'
import { plural } from '../components/plural'
import { sameHeartRateCopy } from '../sameHeartRateCopy'

/** What each sport's reading counts, since treadmill pace and estimated watts can be what is wrong. */
const COUNTS: Record<Sport, string> = {
  run: 'Counts outdoor runs.',
  ride: 'Counts rides with a power meter.',
}

/**
 * Under each chart: how a dot is made and what it counts, and the limit of the reading. Fatigue can
 * lower heart rate at a given effort (Hammes 2016), so a rise is not always training.
 */
function noteFor(sport: Sport): string {
  const window = plural(SAME_HEART_RATE.windowDays / 7, 'week')
  return `Each dot is fitted to the steady 5-minute stretches of the ${window} to that Sunday, and its bar is the 90% range. ${COUNTS[sport]} Fatigue can lower heart rate at a given effort, so a rise can come with fatigue as well as with training.`
}

/**
 * A sport's output at one heart rate, week by week, after the weekly best efforts. It says the change
 * in a sentence only when the first and last weeks' ranges do not overlap, and with too little data it
 * says what is missing instead of drawing.
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
  const copy = sameHeartRateCopy(sport, data, units)
  return (
    <section className="section" aria-labelledby={`${sport}-same-heart-rate`}>
      <h2 id={`${sport}-same-heart-rate`}>At the same heart rate</h2>
      <p className={copy.kind === 'missing' ? 'muted' : 'secondary'}>{copy.text}</p>
      {data.change !== null && (
        <SameHeartRateChart sport={sport} data={data} units={units} note={noteFor(sport)} />
      )}
    </section>
  )
}
