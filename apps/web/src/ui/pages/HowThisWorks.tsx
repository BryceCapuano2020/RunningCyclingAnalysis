import { MethodLines } from '../components/MethodLines'
import { MoreDetail } from '../components/TopicBody'
import { STATE_COPY, STATE_ORDER, entriesOf } from '../components/methodEntries'
import { SECTION_ID } from '../components/methodTopics'
import './HowThisWorks.css'

/**
 * What the app shows and where each number comes from, in one list: calculated by the app, recorded in
 * the files, or not available from activity files. Each idea is one entry, said once, with its technical
 * detail behind a More detail disclosure.
 */
export function HowThisWorks() {
  return (
    <section className="section how" aria-labelledby={SECTION_ID.how}>
      <h2 id={SECTION_ID.how} tabIndex={-1}>
        How this works
      </h2>
      <p className="secondary">Where each number in the app comes from, and what it assumes.</p>
      {STATE_ORDER.map((state) => (
        <section key={state} className="how__group" aria-labelledby={`how-${state}`}>
          <h3 id={`how-${state}`}>{STATE_COPY[state].title}</h3>
          <MethodLines lines={STATE_COPY[state].lines} />
          <dl className="how__entries">
            {entriesOf(state).map((entry) => (
              <div key={entry.name} className="how__entry">
                <dt>{entry.name}</dt>
                <dd>
                  <MethodLines lines={entry.lines} />
                  {entry.detail && <MoreDetail about={entry.name} lines={entry.detail} />}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  )
}
