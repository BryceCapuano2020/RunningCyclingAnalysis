import { goToSection } from './goToSection'
import './SectionNav.css'

export interface SectionNavItem {
  /** The id of the element to scroll to; a closed disclosure with this id is opened. */
  id: string
  label: string
}

/**
 * "On this page": one row of buttons that jump to each section of a long page. On a desktop it holds its
 * place under the header while the page scrolls, so a section is one press from anywhere; on a phone it is
 * a row that scrolls sideways. It sits after the period control, so the answer keeps the first screen.
 */
export function SectionNav({ items }: { items: readonly SectionNavItem[] }) {
  if (items.length < 2) return null
  return (
    <nav className="section-nav" aria-label="On this page">
      <ul className="section-nav__list">
        {items.map(({ id, label }) => (
          <li key={id}>
            <button type="button" className="section-nav__button" onClick={() => goToSection(id)}>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
