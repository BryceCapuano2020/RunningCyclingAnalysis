import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import { FLAT_RUN_COST, PRIORS, RUN_COST_CORRECTION } from '@rca/core/constants'
import {
  DEFAULT_WINDOW_DAYS,
  EFFORT_LENGTHS_S,
  MIN_WINDOW_DAYS,
} from '@rca/core/digest/trendPoints'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import './Methodology.css'

interface Section {
  title: string
  body: string
}

/** The effort lengths the trend offers, in minutes, as a phrase: "5, 20 or 60 minutes". */
const EFFORT_MINUTES = EFFORT_LENGTHS_S.map((durationS) => durationS / 60)
const EFFORT_PHRASE = `${EFFORT_MINUTES.slice(0, -1).join(', ')} or ${EFFORT_MINUTES.at(-1)} minutes`
const BALANCE_MINUTES = HEADLINE_DURATION_S / 60

const EFFICIENCY_PERCENT = (PRIORS.grossEfficiency.mean * 100).toFixed(1)
const spreadPercent = (prior: { mean: number; sd: number }) =>
  Math.round((prior.sd / prior.mean) * 100)

const SECTIONS: Section[] = [
  {
    title: 'One unit for both sports',
    body:
      `Cycling power is divided by gross efficiency, the share of the metabolic energy used that ` +
      `reaches the pedals, which averages about ${EFFICIENCY_PERCENT}%. Running speed and ` +
      `gradient are converted with the Minetti et al. 2002 energy-cost-of-running curve, raised by ` +
      `${RUN_COST_CORRECTION} J/kg/m, so flat running costs ${FLAT_RUN_COST.toFixed(1)} J/kg/m, ` +
      `near the middle of published estimates. Both become an energy rate (gross metabolic power, ` +
      `W/kg): watts of energy burned per kilogram of body weight.`,
  },
  {
    title: 'Why there is a range',
    body:
      `Efficiency varies between people by about ${spreadPercent(PRIORS.grossEfficiency)}%, and ` +
      `running economy by about ${spreadPercent(PRIORS.runEconomyScale)}%. A FIT file cannot show ` +
      'either one. The 90% range summarises those model assumptions. It does not include every ' +
      'source of sensor error, missing effort, or error in virtual power, and it is not a fitness ' +
      'percentile.',
  },
  {
    title: 'Fitness over time',
    body:
      'Each point is a week ending on a Sunday, in UTC. It takes the best effort of each sport, of ' +
      `the chosen length (${EFFORT_PHRASE}; Balance uses ${BALANCE_MINUTES}), in the trailing window ` +
      'that ends at that week’s end: grade-adjusted pace for running, and ' +
      `power in watts for cycling. The window is ${DEFAULT_WINDOW_DAYS} days over all time, and a ` +
      `third of a shorter period, at least ${MIN_WINDOW_DAYS} days and at most ` +
      `${DEFAULT_WINDOW_DAYS} days, so a six-week period uses two-week windows. Each window lies ` +
      'inside the selected period. The effort is judged on energy rate, using prior-mean efficiency ' +
      'and running economy. Every point is priced with the selected period’s one bike model. The ' +
      'headline reports the median of the model draws, ' +
      'which heart-rate calibration can shift, so the two can differ. The model range shown with the ' +
      'headline is not drawn for each week. A gap means no run or ride with an effort of that length in the ' +
      'window. The bike model is fitted on the activities in the selected period.',
  },
  {
    title: 'Heart-rate check',
    body:
      'The model assumes heart rate responds to energy rate similarly in both sports. Under that ' +
      'assumption, differences in the fitted slopes can adjust the energy estimates. This is not an ' +
      'independent measurement of efficiency. If too few model samples support an adjustment, the ' +
      'population-based range is kept instead. Heart-rate checks judge each sport’s best efforts ' +
      'against a reference maximum built from each sport’s highest sustained heart rate. Running uses ' +
      'the higher of its own maximum and the cycling maximum. Cycling uses the higher of its own maximum ' +
      `and ${RIDE_MAX_OFFSET_BPM} bpm below the running maximum, because cycling maximum usually runs ` +
      `5 to 7 bpm lower, so it is never more than ${RIDE_MAX_OFFSET_BPM} bpm below running.`,
  },
  {
    title: 'Virtual power meter',
    body:
      'Power is estimated on climbs from speed, gradient and weight using a model fitted to your ' +
      'power-meter rides; its accuracy is scored on each ride with that ride left out of the fit. ' +
      'Only climbs are used, because wind and drafting dominate on flat roads. Air density follows ' +
      'altitude from the file (ISA, 15 °C), with sea level when altitude is missing or the ride is indoors.',
  },
  {
    title: 'Data checks',
    body:
      'Sensor dropouts and impossible readings are excluded automatically. Each activity lists ' +
      'its problems with the time they occurred.',
  },
  {
    title: 'Where speed comes from',
    body:
      'A TCX file with device speed uses that speed. A TCX file with device distance but no speed ' +
      'derives speed from the distance, as a centred difference over 10 seconds either side of each ' +
      'point. GPX files never carry device speed, and neither does a TCX file with only positions, ' +
      'so their speed comes from the GPS track: a centred window of 20 seconds, with fixes that imply ' +
      'more than twice the sport’s maximum speed rejected, and a gap longer than 30 seconds crediting ' +
      'no distance. Speeds below 0.5 m/s count as still. Short best efforts under about 30 seconds ' +
      'from GPS-only files are less reliable than from a device.',
  },
  {
    title: 'Limits',
    body:
      'Best efforts are only as good as the hardest efforts on file. Heat, altitude and fatigue ' +
      'shift heart rate. Treadmill and indoor data have no gradient, so they are treated as flat.',
  },
]

export function Methodology() {
  return (
    <details className="methodology card">
      <summary>
        <h2>How this works and what it assumes</h2>
      </summary>
      <div className="methodology__sections">
        {SECTIONS.map((section) => (
          <section key={section.title} className="methodology__section">
            <h3>{section.title}</h3>
            <p className="secondary">{section.body}</p>
          </section>
        ))}
      </div>
    </details>
  )
}
