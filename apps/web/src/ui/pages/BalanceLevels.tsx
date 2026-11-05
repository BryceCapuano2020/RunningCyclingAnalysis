import { Definition } from '../components/Definition'
import { SPORT_TITLE } from '../sports'
import { DEFINITIONS } from './balanceDefinitions'
import type { BalanceLevelsModel } from './levelsModel'
import './BalanceLevels.css'

/**
 * Each sport's level on one plain line under the meter: its name, its age grade in mono, then the level of that grade's
 * centre. No icon or colour: the meter's ends already say which sport is which. A sport with no grade says what it is missing.
 */
export function BalanceLevels({ model }: { model: BalanceLevelsModel }) {
  if (model.rows.length === 0 && model.note === null) return null
  const firstNamed = model.rows.findIndex((row) => row.level !== null)
  return (
    <section className="balance-levels" aria-label="Level in each sport">
      {model.note === null ? (
        <ul className="balance-levels__list">
          {model.rows.map((row, index) => (
            <li key={row.sport} className="balance-levels__row" data-sport={row.sport}>
              <span className="balance-levels__name">{SPORT_TITLE[row.sport]}</span>{' '}
              {row.grade === null ? (
                <span className="balance-levels__missing">{row.missing}</span>
              ) : (
                <>
                  <span className="num balance-levels__grade">{row.grade}</span>{' '}
                  <span className="balance-levels__level">
                    {/* The level is defined once, on the first row that names one. */}
                    {index === firstNamed ? (
                      <Definition meaning={DEFINITIONS.level}>{row.level}</Definition>
                    ) : (
                      row.level
                    )}
                  </span>
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
