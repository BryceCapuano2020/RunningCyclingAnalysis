// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { SparkPoint } from './sparkRule'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeActivity } from './fixtures'
import { SportRecords } from './SportRecords'
import { MIN_SPARK_POINTS } from './sparkRule'
import { recordRow } from '../recordRow'
import type { RecordRow } from '../recordRow'
import { wholeText } from '../test/wholeText'

// A fixed clock, so the friendly dates do not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Local date: 5 January 2026 is a Monday.
const morningRun = makeActivity({
  id: 'run-1',
  name: 'Morning run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
})
const lateRun = makeActivity({
  id: 'run-2',
  name: 'Late run',
  startMs: new Date(2026, 0, 9, 17, 0).getTime(),
})

function row(overrides: Partial<RecordRow>): RecordRow {
  return {
    key: 'r',
    label: '20 min',
    value: '4:00 /km',
    sub: null,
    grade: null,
    tags: [],
    setDays: null,
    activity: morningRun,
    ...overrides,
  }
}

describe('SportRecords', () => {
  it('lists each record’s label, figure and its second reading and grade', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', value: '3:50 /km' }),
          row({
            key: 'b',
            label: '20 min',
            value: '250 W',
            sub: '3.3 W/kg',
            grade: 'Estimated · Local · 67%',
          }),
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]!).getByText(wholeText('250 W'))).toBeInTheDocument()
    expect(within(items[1]!).getByText(wholeText('3.3 W/kg'))).toBeInTheDocument()
    expect(within(items[1]!).getByText(wholeText('Estimated · Local · 67%'))).toBeInTheDocument()
  })

  it('links each record to its activity, named with its label and the day it was set', () => {
    render(
      <SportRecords
        rows={[row({ label: '20 min' }), row({ key: 'late', label: '5 min', activity: lateRun })]}
      />,
    )
    const first = screen.getByRole('link', { name: '20 min, from Morning run, 5 Jan' })
    expect(first).toHaveAttribute('href', '#/activities/run-1')
    expect(screen.getByRole('link', { name: '5 min, from Late run, 9 Jan' })).toHaveAttribute(
      'href',
      '#/activities/run-2',
    )
  })

  it('gives each link its full name as a title, for a name the layout truncates', () => {
    const long = makeActivity({
      id: 'long',
      name: 'Threshold test: 3, 6, 12 and 20 minute efforts on the hill loop',
      startMs: new Date(2026, 0, 5, 7, 30).getTime(),
    })
    render(<SportRecords rows={[row({ activity: long }), row({ key: 'b', activity: lateRun })]} />)
    expect(
      screen.getByRole('link', {
        name: '20 min, from Threshold test: 3, 6, 12 and 20 minute efforts on the hill loop, 5 Jan',
      }),
    ).toHaveAttribute(
      'title',
      'Threshold test: 3, 6, 12 and 20 minute efforts on the hill loop, 5 Jan',
    )
  })

  it('writes one source line when every record was set in the same activity', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', value: '3:50 /km' }),
          row({ key: 'b', label: '20 min', value: '4:00 /km' }),
        ]}
      />,
    )
    expect(screen.getByText(/All set on/).closest('p')).toHaveTextContent(
      'All set on Morning run, 5 Jan',
    )
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Morning run, 5 Jan' })).toHaveAttribute(
      'href',
      '#/activities/run-1',
    )
  })

  it('says when every record was set in the one activity, on the source line, and not on each row', () => {
    // Set 156 days before the page opened: five months, rounded to the nearest whole month.
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', value: '3:50 /km', setDays: 156 }),
          row({ key: 'b', label: '20 min', value: '4:00 /km', setDays: 156 }),
        ]}
      />,
    )
    expect(screen.getByText(/All set on/).closest('p')).toHaveTextContent(
      'All set on Morning run, 5 Jan · 5 months ago',
    )
    expect(screen.queryByText(/^Set /)).not.toBeInTheDocument()
  })

  it('keeps the shared count in the link’s own container, so the line has two columns and no loose text', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', value: '3:50 /km', setDays: 156 }),
          row({ key: 'b', label: '20 min', value: '4:00 /km', setDays: 156 }),
        ]}
      />,
    )
    const line = screen.getByText(/All set on/).closest('p')!
    expect(line.children).toHaveLength(2)
    const loose = [...line.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    )
    expect(loose).toHaveLength(0)
    const source = screen
      .getByRole('link', { name: 'Morning run, 5 Jan' })
      .closest('.records__source')
    expect(source).toBe(line.children[1])
    expect(source).toHaveTextContent('Morning run, 5 Jan · 5 months ago')
  })

  it('gives each row one meta line: the day, the activity as a link, then the grade, and no count of days ago', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', setDays: 156, grade: 'Local 61%' }),
          row({ key: 'b', label: '20 min', activity: lateRun, setDays: 4 }),
        ]}
      />,
    )
    const [first, second] = screen.getAllByRole('listitem')
    const body = first!.querySelector('.row__body')!
    // The title and one meta line, nothing else on screen.
    const shown = [...body.children].filter((child) => !child.classList.contains('sr-only'))
    expect(shown.map((child) => child.className)).toEqual([
      'row__title records__label',
      'meta records__meta',
    ])
    const meta = first!.querySelector('.records__meta')!
    expect([...meta.children].map((child) => child.textContent)).toEqual([
      '5 Jan',
      'Morning run',
      'Local 61%',
    ])
    expect(meta.children[1]).toHaveAttribute('href', '#/activities/run-1')
    expect(first).not.toHaveTextContent(/ago/)
    expect(second).not.toHaveTextContent(/ago/)
  })

  it('writes the shared count as quiet text, not a chip', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', setDays: 156 }),
          row({ key: 'b', label: '20 min', setDays: 156 }),
        ]}
      />,
    )
    const count = screen.getByText(wholeText('5 months ago'))
    expect(count).toHaveClass('records__set')
    expect(count).not.toHaveClass('chip')
  })

  it('says no count of days ago on a row when the records come from different activities: its date says when', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', setDays: 9 }),
          row({ key: 'b', label: '20 min', activity: lateRun, setDays: 4 }),
        ]}
      />,
    )
    expect(screen.queryByText(/All set on/)).not.toBeInTheDocument()
    expect(screen.queryByText(/days ago/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[1]!.querySelector('.records__date')).toHaveTextContent(
      /^9 Jan$/,
    )
  })

  it('keeps the activity on the row’s meta line and out of its figure', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min', value: '3:50 /km', setDays: 156 }),
          row({ key: 'b', label: '20 min', value: '250 W', activity: lateRun, setDays: 4 }),
        ]}
      />,
    )
    const [first, second] = screen.getAllByRole('listitem')
    const link = screen.getByRole('link', { name: '5 min, from Morning run, 5 Jan' })
    expect(link.closest('.records__meta')?.closest('li')).toBe(first)
    expect(
      within(first!).getByText(wholeText('3:50 /km')).closest('.records__figure'),
    ).not.toHaveTextContent('Morning')
    expect(
      [...second!.querySelector('.records__meta')!.children].map((child) => child.textContent),
    ).toEqual(['9 Jan', 'Late run'])
  })

  it('sets the date before the link and the name in it, the whole of both as the link’s title', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min' }),
          row({ key: 'b', label: '20 min', activity: lateRun }),
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: '5 min, from Morning run, 5 Jan' })
    expect(link).toHaveTextContent(/^Morning run$/)
    expect(link.previousElementSibling).toHaveClass('records__date')
    expect(link.previousElementSibling).toHaveTextContent(/^5 Jan$/)
    // The whole text is still the title, so a cut name can be read in full.
    expect(link).toHaveAttribute('title', 'Morning run, 5 Jan')
  })

  it('keeps each link when the records come from different activities', () => {
    render(
      <SportRecords
        rows={[
          row({ key: 'a', label: '5 min' }),
          row({ key: 'b', label: '20 min', activity: lateRun }),
        ]}
      />,
    )
    expect(screen.queryByText(/All set on/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('shows a record without its link when its activity is not in the result', () => {
    render(<SportRecords rows={[row({ activity: null })]} />)
    expect(screen.getByText(wholeText('4:00 /km'))).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows each tag a row carries as plain words on its meta line, never a chip', () => {
    render(<SportRecords rows={[row({ value: '4:00 /km', tags: ['All-time record'] })]} />)
    const tag = screen.getByText('All-time record')
    expect(tag).toHaveClass('record-tag')
    expect(tag).not.toHaveClass('chip')
    expect(tag.closest('.meta')).not.toBeNull()
  })

  it('numbers its rows and sets each figure’s unit apart, smaller', () => {
    const { container } = render(
      <SportRecords
        rows={[row({ key: 'a' }), row({ key: 'b', label: '20 min', value: '250 W' })]}
      />,
    )
    expect(
      Array.from(container.querySelectorAll('.row__index')).map((index) => index.textContent),
    ).toEqual(['01', '02'])
    expect(container.querySelector('ol.records')).not.toBeNull()
    expect(screen.getByText('W', { selector: '.row__unit' })).toBeInTheDocument()
  })

  it('shows no chip and no tag for a row with no tags', () => {
    const { container } = render(<SportRecords rows={[row({ value: '400 W', tags: [] })]} />)
    expect(container.querySelector('.chip, .record-tag')).toBeNull()
    expect(container.querySelector('.records__meta')).not.toHaveTextContent('GAP')
    expect(screen.getByText(wholeText('400 W'))).toBeInTheDocument()
  })

  it('draws sparklines only when every row has one of at least six points, and none at all otherwise', () => {
    const series = (n: number) => Array.from({ length: n }, (_, i) => ({ atMs: i, value: 3 + i }))
    const rows = [row({ key: '300' }), row({ key: '1200', label: '20 min' })]
    const full = render(
      <SportRecords rows={rows} sparks={{ '300': series(6), '1200': series(7) }} />,
    )
    const drawn = Array.from(full.container.querySelectorAll('li'))
    expect(drawn.every((li) => li.querySelector(':scope > .row__spark > svg') !== null)).toBe(true)
    full.unmount()
    // One row with five points, or one row with none, and the list draws no line at all.
    const partial: Record<string, readonly SparkPoint[]>[] = [
      { '300': series(6), '1200': series(MIN_SPARK_POINTS - 1) },
      { '300': series(6) },
    ]
    for (const sparks of partial) {
      const { container, unmount } = render(<SportRecords rows={rows} sparks={sparks} />)
      expect(container.querySelector('svg')).toBeNull()
      unmount()
    }
  })

  it('says a drawn row’s trend in words to a screen reader when the row has no change line', () => {
    const series = (step: number) =>
      Array.from({ length: 6 }, (_, i) => ({ atMs: i, value: 300 + i * step }))
    const { container } = render(
      <SportRecords
        rows={[row({ key: '300' }), row({ key: '1200', label: '20 min' })]}
        sparks={{ '300': series(10), '1200': series(0.1) }}
      />,
    )
    const [up, flat] = Array.from(container.querySelectorAll('.row__spark'))
    expect(up?.querySelector('.sr-only')).toHaveTextContent('Trend up')
    expect(flat?.querySelector('.sr-only')).toHaveTextContent('Trend flat')
  })

  it('marks a run’s pace Flat, in words', () => {
    render(<SportRecords rows={[row({ value: '4:00 /km', tags: ['Flat'] })]} />)
    expect(screen.getByText('Flat')).toBeInTheDocument()
  })
})

describe('recordRow', () => {
  const record = {
    durationS: 1200,
    value: '4:00 /km',
    number: '4:00',
    unit: '/km',
    sub: null,
    activity: morningRun,
    covered: null,
  }

  it('leaves a run’s pace untagged: its list says once that paces are GAP', () => {
    expect(recordRow(record, { label: '20 min', grade: null }).tags).toEqual([])
  })

  it.each([
    ['estimated by virtual power', { ...morningRun, powerSource: 'virtual' as const }],
    ['measured by a power meter', { ...morningRun, powerSource: 'measured' as const }],
    ['from a ride that is not in the result', null],
  ])('leaves a ride’s watts untagged when they are %s', (_, activity) => {
    const ride = { ...record, value: '250 W', activity }
    expect(recordRow(ride, { label: '20 min', grade: null }).tags).toEqual([])
  })

  it('carries the days since each record was set, so the list can say how long ago', () => {
    const row = recordRow(record, { label: '20 min', grade: null, setDays: 9 })
    expect(row.setDays).toBe(9)
    expect(recordRow(record, { label: '20 min', grade: null }).setDays).toBeNull()
  })

  it('carries the label, figure, second reading, grade and activity of the record', () => {
    const row = recordRow(
      { ...record, sub: '3.3 W/kg' },
      { label: 'Best 20 min', grade: 'Local · 67%' },
    )
    expect(row).toMatchObject({
      key: '1200',
      label: 'Best 20 min',
      value: '4:00 /km',
      sub: '3.3 W/kg',
      grade: 'Local · 67%',
      activity: morningRun,
    })
  })
})
