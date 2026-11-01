import { describe, expect, it } from 'vitest'
import {
  COMPACT_PHONE_MAX_WIDTH_PX,
  PERIOD_FULL_WIDTH_MAX_WIDTH_PX,
  PERIOD_SHORT_LABEL_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SPLIT_FILTERS_MIN_WIDTH_PX,
} from '../layoutBreakpoints'
import { readStylesheet } from './stylesheet'

const rangePicker = await readStylesheet(import.meta.url, './RangePicker.css')
const segmented = await readStylesheet(import.meta.url, './SegmentedControl.css')
const activityList = await readStylesheet(import.meta.url, './ActivityList.css')
const pager = await readStylesheet(import.meta.url, './Pager.css')
const activitiesPage = await readStylesheet(import.meta.url, '../pages/ActivitiesPage.css')
const activityDelete = await readStylesheet(import.meta.url, './ActivityDelete.css')

/** The declarations of every rule whose selector list names `selector` exactly, in source order. */
function rulesWith(css: string, selector: string): string {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const bodies: string[] = []
  for (const [, list = '', body = ''] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (list.split(',').some((part) => part.trim() === selector)) bodies.push(body)
  }
  return bodies.join('\n')
}

/** The text of the first @media block with this query, braces included, or '' when there is none. */
function mediaOf(css: string, query: string): string {
  const open = css.indexOf(`@media ${query} {`)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open, i + 1)
    }
  }
  return ''
}

const PHONE_480 = '(max-width: 479px)'
const NARROW_PHONE = '(max-width: 560px)'
const PHONE_760 = '(max-width: 760px)'
const ABOVE_PHONE = '(min-width: 761px)'

describe('the period control', () => {
  it('sets no minimum height on the dates line, so an empty line takes no room', () => {
    expect(rulesWith(rangePicker, '.range-picker__caption')).not.toMatch(/min-height/)
  })

  it('sizes the control to its content, so it does not stretch across a wide page', () => {
    expect(rulesWith(rangePicker, '.range-picker')).toMatch(/justify-items:\s*start/)
  })

  it('shows short labels at 479 px and below, keeping the full name in the page', () => {
    const small = mediaOf(rangePicker, PHONE_480)
    expect(rulesWith(small, '.range-picker .segmented-control__short')).toMatch(/display:\s*inline/)
    expect(rulesWith(small, '.range-picker .segmented-control__full')).toMatch(
      /clip-path:\s*inset\(50%\)/,
    )
    expect(rulesWith(rangePicker, '.range-picker .segmented-control__short')).toMatch(
      /display:\s*none/,
    )
  })

  it('fills the content width below 480 px, so the control meets the gutter on a phone', () => {
    const phone = mediaOf(rangePicker, PHONE_480)
    expect(rulesWith(phone, '.range-picker')).toMatch(/width:\s*100%/)
    expect(rulesWith(phone, '.range-picker .segmented-control__options')).toMatch(/display:\s*flex/)
  })

  it('changes the border of an unselected segment on hover, as well as its fill', () => {
    const hover = rulesWith(
      segmented,
      '.segmented-control__option:not(.segmented-control__option--selected):hover',
    )
    expect(hover).toMatch(/background:\s*var\(--surface-2\)/)
    expect(hover).toMatch(/border-color:\s*var\(--text-secondary\)/)
  })
})

describe('the Custom form', () => {
  it('sizes its date fields to the control height, with 16 px text so iOS does not zoom', () => {
    const field = rulesWith(rangePicker, '.range-picker__field input')
    expect(field).toMatch(/min-height:\s*var\(--control-height\)/)
    expect(field).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('lets a segment take its natural width, so a segment alone on a row is not a full-width bar', () => {
    const segment = rulesWith(rangePicker, '.range-picker .segmented-control__option')
    expect(segment).toMatch(/flex:\s*0 0 auto/)
    expect(segment).not.toMatch(/flex:\s*1 1 auto/)
  })

  it('places the two fields side by side when they fit, and stacks them when they do not', () => {
    expect(rulesWith(rangePicker, '.range-picker__custom')).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*var\(--column-field\)\),\s*1fr\)\)/,
    )
  })

  it('puts Apply, and the hint when a date is refused, on a row of their own below the fields', () => {
    expect(rulesWith(rangePicker, '.range-picker__apply')).toMatch(/grid-column:\s*1 \/ -1/)
    expect(rulesWith(rangePicker, '.range-picker__hint')).toMatch(/grid-column:\s*1 \/ -1/)
  })
})

describe('the activity list', () => {
  it('sets a row as two lines up to 760 px: the name, then the date and figures, with no chevron', () => {
    const phone = mediaOf(activityList, PHONE_760)
    expect(rulesWith(phone, '.activity-list__chevron')).toMatch(/display:\s*none/)
    expect(rulesWith(phone, '.activity-list__main')).toMatch(/display:\s*flex/)
    expect(rulesWith(phone, '.activity-list__main')).toMatch(/flex-wrap:\s*wrap/)
    expect(rulesWith(phone, '.activity-list__sub')).toMatch(/display:\s*contents/)
    expect(rulesWith(phone, '.activity-list__head')).toMatch(/flex:\s*1 1 calc\(100% - 2.5rem\)/)
  })

  it('keeps the figure labels for screen readers when a phone row drops them', () => {
    expect(rulesWith(mediaOf(activityList, PHONE_760), '.activity-list__label')).toMatch(
      /clip-path:\s*inset\(50%\)/,
    )
  })

  it('drops the Delete word for an overflow mark below 560 px, keeping the button a full target', () => {
    const phone = mediaOf(activityDelete, NARROW_PHONE)
    expect(rulesWith(phone, '.activity-delete__word')).toMatch(/display:\s*none/)
    expect(rulesWith(phone, '.activity-delete__more')).toMatch(/display:\s*inline-block/)
    expect(rulesWith(activityDelete, '.activity-delete__more')).toMatch(/display:\s*none/)
    expect(rulesWith(phone, '.activity-list__item .activity-delete__open')).toMatch(
      /min-width:\s*var\(--control-height\)/,
    )
  })

  it('sets the period, then the sport with the sort beside it, below 560 px, with their labels kept for readers', () => {
    const phone = mediaOf(activitiesPage, NARROW_PHONE)
    expect(rulesWith(phone, '.activities__filters')).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 9rem\)/,
    )
    expect(rulesWith(phone, '.activities__sort > span')).toMatch(/clip-path:\s*inset\(50%\)/)
  })

  it('keeps each figure value on one line', () => {
    expect(rulesWith(activityList, '.activity-list__value')).toMatch(/white-space:\s*nowrap/)
  })

  it('sets each figure in its own column, so a row without distance or climb leaves a gap', () => {
    expect(rulesWith(activityList, '.activity-list__stat--distance')).toMatch(/grid-column:\s*2/)
    expect(rulesWith(activityList, '.activity-list__stat--hero')).toMatch(/grid-column:\s*4/)
  })

  it('draws an inset rule on the left of a row on hover', () => {
    expect(rulesWith(activityList, '.activity-list__item:hover')).toMatch(
      /box-shadow:\s*inset 3px 0 0 var\(--text-secondary\)/,
    )
  })

  it('makes Delete a quiet text button, with no border or fill at rest', () => {
    const open = rulesWith(activityList, '.activity-list__item .activity-delete__open')
    expect(open).toMatch(/background:\s*transparent/)
    expect(open).toMatch(/border-color:\s*transparent/)
  })

  it('sets the Sort by label in the small secondary text of the legends', () => {
    const label = rulesWith(activitiesPage, '.activities__sort > span')
    expect(label).toMatch(/font-size:\s*var\(--text-sm\)/)
    expect(label).toMatch(/font-weight:\s*400/)
    expect(label).toMatch(/color:\s*var\(--text-secondary\)/)
  })

  it('sets Sort beside Sport from 761 px, the first width past the phone layout', () => {
    expect(rulesWith(mediaOf(activitiesPage, ABOVE_PHONE), '.activities__filters')).toMatch(
      /grid-template-columns:\s*auto auto/,
    )
  })

  it('puts the page numbers on a row of their own below 560 px, with Previous and Next beneath', () => {
    const phone = mediaOf(pager, NARROW_PHONE)
    expect(rulesWith(phone, '.pager__controls')).toMatch(/grid-template-columns:\s*1fr 1fr/)
    expect(rulesWith(phone, '.pager__pages')).toMatch(/grid-column:\s*1 \/ -1/)
    expect(rulesWith(phone, '.pager__pages')).toMatch(/order:\s*-1/)
  })
})

describe('breakpoints named in layoutBreakpoints.ts', () => {
  // Each stylesheet repeats its width in a media query and names the file in a comment, so a change is
  // made in the file and the query together. This fails when they disagree.
  it('gives each width its media query in the stylesheet that uses it', () => {
    expect(activityList).toContain(`@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
    expect(activityList).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(pager).toContain(`@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
    expect(activitiesPage).toContain(`@media (min-width: ${SPLIT_FILTERS_MIN_WIDTH_PX}px)`)
    expect(rangePicker).toContain(`@media (max-width: ${PERIOD_FULL_WIDTH_MAX_WIDTH_PX}px)`)
    expect(rangePicker).toContain(`@media (max-width: ${PERIOD_SHORT_LABEL_MAX_WIDTH_PX}px)`)
  })

  it('names layoutBreakpoints.ts in a comment beside each of them', () => {
    for (const css of [activityList, pager, activitiesPage, rangePicker]) {
      expect(css).toContain('layoutBreakpoints.ts')
    }
  })

  it('takes the Activities split from one past the phone layout, so the two never overlap', () => {
    expect(SPLIT_FILTERS_MIN_WIDTH_PX).toBe(PHONE_MAX_WIDTH_PX + 1)
  })
})
