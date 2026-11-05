import { goToSection } from './goToSection'
import './SectionNav.css'

export interface SectionNavItem {
  /** The id of the element to scroll to; a closed disclosure with this id is opened. */
  id: string
  label: string
}

/**
 * "On this page": one plain line of mono words that jump to each section of a long page, after the answer. It does
 * not stick: the rail holds the page's place, and the line wraps rather than scroll.
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
