import { SPORT_TITLE } from '../sports'
import type { BalanceLevelsModel } from './levelsModel'
import './BalanceLevels.css'

/**
 * Each sport's level on one plain line under the meter: its name, its age grade in mono, then the level of that grade's
 * centre. No icon or colour: the meter's ends already say which sport is which. A sport with no grade says what it is missing.
 * The level is plain text: what a level is waits in the answer's Details, so nothing on the line reads as a link.
 */
export function BalanceLevels({ model }: { model: BalanceLevelsModel }) {
  if (model.rows.length === 0 && model.note === null) return null
  return (
    <section className="balance-levels" aria-label="Level in each sport">
      {model.note === null ? (
        <ul className="balance-levels__list">
          {model.rows.map((row) => (
            <li key={row.sport} className="balance-levels__row" data-sport={row.sport}>
              <span className="balance-levels__name">{SPORT_TITLE[row.sport]}</span>{' '}
              {row.grade === null ? (
                <span className="balance-levels__missing">{row.missing}</span>
              ) : (
                <>
                  <span className="num balance-levels__grade">{row.grade}</span>{' '}
                  <span className="balance-levels__level">{row.level}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="balance-levels__missing">{model.note}</p>
      )}
    </section>
  )
}
