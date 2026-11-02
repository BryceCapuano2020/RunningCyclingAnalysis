import { CALCULATION_ITEMS, STATE_COPY, STATE_ORDER } from '../components/methodCalculated'
import { SECTION_ID } from '../components/methodTopics'
import './CalculatedSection.css'

/**
 * What the app shows and where each number comes from, in three states: calculated by the app,
 * recorded in the files, and not available from activity files at all.
 */
export function CalculatedSection() {
  return (
    <section className="section calculated" aria-labelledby={SECTION_ID.calculated}>
      <h2 id={SECTION_ID.calculated} tabIndex={-1}>
        What is calculated
      </h2>
      <p className="secondary">Where each number in the app comes from.</p>
      {STATE_ORDER.map((state) => (
        <section key={state} className="calculated__group" aria-labelledby={`calculated-${state}`}>
          <h3 id={`calculated-${state}`}>{STATE_COPY[state].title}</h3>
          {STATE_COPY[state].lines.map((line) => (
            <p key={line} className="secondary">
              {line}
            </p>
          ))}
          <dl className="calculated__items">
            {CALCULATION_ITEMS.filter((item) => item.state === state).map((item) => (
              <div key={item.name} className="calculated__item">
                <dt>{item.name}</dt>
                <dd>
                  {item.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  )
}
