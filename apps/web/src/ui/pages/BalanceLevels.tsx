import { Definition } from '../components/Definition'
import { SportIcon } from '../components/icons'
import { SPORT_TITLE } from '../sports'
import { DEFINITIONS } from './balanceDefinitions'
import type { BalanceLevelsModel } from './levelsModel'
import './BalanceLevels.css'

/**
 * Each sport's level on one plain line under the meter, named as the meter's ends are: its name, its age grade, then the level that grade
 * names. The sport colour marks the sport's glyph only. A sport with no grade says what it is missing.
 */
export function BalanceLevels({ model }: { model: BalanceLevelsModel }) {
  if (model.rows.length === 0 && model.note === null) return null
  return (
    <section className="balance-levels" aria-label="Level in each sport">
      {model.note === null ? (
        <ul className="balance-levels__list">
          {model.rows.map((row) => (
            <li key={row.sport} className="balance-levels__row" data-sport={row.sport}>
              <span className="tag tag--ink balance-levels__name">
                <SportIcon sport={row.sport} className="balance-levels__glyph" />
                {SPORT_TITLE[row.sport]}
              </span>{' '}
              {row.grade === null ? (
                <span className="balance-levels__missing">{row.missing}</span>
              ) : (
                <>
                  <span className="balance-levels__grade">{row.grade}</span>{' '}
                  <span className="balance-levels__level">
                    <Definition meaning={DEFINITIONS.level}>{row.level}</Definition>
                  </span>
                  {row.basis ? <span className="balance-levels__basis">{row.basis}</span> : null}
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
