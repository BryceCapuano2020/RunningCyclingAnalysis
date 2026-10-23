import { PRIORS } from '@rca/core/constants'
import './Methodology.css'

interface Section {
  title: string
  body: string
}

const EFFICIENCY_PERCENT = (PRIORS.grossEfficiency.mean * 100).toFixed(1)

const SECTIONS: Section[] = [
  {
    title: 'One unit for both sports',
    body:
      `Cycling power is divided by gross efficiency, the share of the metabolic energy used that ` +
      `reaches the pedals, which averages about ${EFFICIENCY_PERCENT}%. Running speed and ` +
      `gradient are converted with the Minetti et al. 2002 energy-cost-of-running curve. Both ` +
      `become watts of energy burned per kilogram of body weight.`,
  },
  {
    title: 'Why there is a range',
    body:
      'Efficiency and running economy vary between people by several percent, and a FIT file ' +
      'cannot show either one. The 90% range summarises those model assumptions. It does not include ' +
      'every source of sensor error, missing effort, or error in virtual power, and it is not a fitness percentile.',
  },
  {
    title: 'Heart-rate check',
    body:
      'The model assumes heart rate responds to energy use similarly in both sports. Under that ' +
      'assumption, differences in the fitted slopes can adjust the energy estimates. This is not an ' +
      'independent measurement of efficiency. If too few model samples support an adjustment, the ' +
      'population-based range is kept instead.',
  },
  {
    title: 'Virtual power meter',
    body:
      'Power is estimated on climbs from speed, gradient and weight using a model fitted to your ' +
      'power-meter rides; its accuracy is scored on each ride with that ride left out of the fit. ' +
      'Only climbs are used, because wind and drafting dominate on flat roads.',
  },
  {
    title: 'Data checks',
    body:
      'Sensor dropouts and impossible readings are excluded automatically. Each activity lists ' +
      'its problems with the time they occurred.',
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
