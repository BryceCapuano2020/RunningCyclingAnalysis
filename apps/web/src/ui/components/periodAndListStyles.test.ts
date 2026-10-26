import { describe, expect, it } from 'vitest'
import {
  COMPACT_PHONE_MAX_WIDTH_PX,
  PERIOD_FULL_WIDTH_MAX_WIDTH_PX,
  PERIOD_GRID_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SPLIT_FILTERS_MIN_WIDTH_PX,
} from '../layoutBreakpoints'
import { readStylesheet } from './stylesheet'

const rangePicker = await readStylesheet(import.meta.url, './RangePicker.css')
const segmented = await readStylesheet(import.meta.url, './SegmentedControl.css')
const activityList = await readStylesheet(import.meta.url, './ActivityList.css')
const pager = await readStylesheet(import.meta.url, './Pager.css')
const activitiesPage = await readStylesheet(import.meta.url, '../pages/ActivitiesPage.css')

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

const SMALL_PHONE = '(max-width: 359px)'
const PHONE_480 = '(max-width: 479px)'
const NARROW_PHONE = '(max-width: 560px)'
const ABOVE_PHONE = '(min-width: 761px)'

describe('the period control', () => {
  it('sets no minimum height on the dates line, so an empty line takes no room', () => {
    expect(rulesWith(rangePicker, '.range-picker__caption')).not.toMatch(/min-height/)
  })

  it('sizes the control to its content, so it does not stretch across a wide page', () => {
    expect(rulesWith(rangePicker, '.range-picker')).toMatch(/justify-items:\s*start/)
  })

  it('lays four periods in a 2 by 2 grid below 360 px, and only four', () => {
    const small = mediaOf(rangePicker, SMALL_PHONE)
    expect(
      rulesWith(small, '.range-picker .segmented-control__options:has(> :nth-child(4))'),
    ).toMatch(/grid-template-columns:\s*1fr 1fr/)
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

describe('the activity list', () => {
  it('sets the hero beside the meta line below 560 px, and hides the chevron there', () => {
    const phone = mediaOf(activityList, NARROW_PHONE)
    expect(rulesWith(phone, '.activity-list__chevron')).toMatch(/display:\s*none/)
    expect(rulesWith(phone, '.activity-list__body')).toMatch(/display:\s*contents/)
    expect(rulesWith(phone, '.activity-list__main')).toMatch(/display:\s*flex/)
    expect(rulesWith(phone, '.activity-list__main')).toMatch(/flex-wrap:\s*wrap/)
    expect(rulesWith(phone, '.activity-list__body > .activity-list__meta')).toMatch(
      /flex:\s*1 1 45%/,
    )
    expect(rulesWith(phone, '.activity-list__hero')).toMatch(/margin-left:\s*auto/)
    expect(rulesWith(phone, '.activity-list__hero')).toMatch(/order:\s*1/)
  })

  it('keeps each figure value on one line', () => {
    expect(rulesWith(activityList, '.activity-list__stat dd')).toMatch(/white-space:\s*nowrap/)
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
    expect(pager).toContain(`@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
    expect(activitiesPage).toContain(`@media (min-width: ${SPLIT_FILTERS_MIN_WIDTH_PX}px)`)
    expect(rangePicker).toContain(`@media (max-width: ${PERIOD_FULL_WIDTH_MAX_WIDTH_PX}px)`)
    expect(rangePicker).toContain(`@media (max-width: ${PERIOD_GRID_MAX_WIDTH_PX}px)`)
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
