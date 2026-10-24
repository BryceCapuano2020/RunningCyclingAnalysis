// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeActivity } from './fixtures'
import { SportRecords } from './SportRecords'
import { recordRow } from '../recordRow'
import type { RecordRow } from '../recordRow'

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
    expect(within(items[1]!).getByText('250 W')).toBeInTheDocument()
    expect(within(items[1]!).getByText('3.3 W/kg')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Estimated · Local · 67%')).toBeInTheDocument()
  })

  it('links each record to its activity, named with its label and the day it was set', () => {
    render(
      <SportRecords
        rows={[row({ label: '20 min' }), row({ key: 'late', label: '5 min', activity: lateRun })]}
      />,
    )
    const first = screen.getByRole('link', { name: '20 min, from Morning run, Mon 5 Jan' })
    expect(first).toHaveAttribute('href', '#/activities/run-1')
    expect(screen.getByRole('link', { name: '5 min, from Late run, Fri 9 Jan' })).toHaveAttribute(
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
        name: '20 min, from Threshold test: 3, 6, 12 and 20 minute efforts on the hill loop, Mon 5 Jan',
      }),
    ).toHaveAttribute(
      'title',
      'Threshold test: 3, 6, 12 and 20 minute efforts on the hill loop, Mon 5 Jan',
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
      'All set on Morning run, Mon 5 Jan',
    )
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Morning run, Mon 5 Jan' })).toHaveAttribute(
      'href',
      '#/activities/run-1',
    )
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
    expect(screen.getByText('4:00 /km')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('tags an estimated figure in words', () => {
    render(<SportRecords rows={[row({ value: '400 W', tags: ['Estimated'] })]} />)
    expect(screen.getByText('Estimated')).toBeInTheDocument()
  })

  it('tags nothing for a measured figure', () => {
    render(<SportRecords rows={[row({ value: '400 W', tags: [] })]} />)
    expect(screen.queryByText('Estimated')).not.toBeInTheDocument()
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
  }

  it('tags a run’s pace Flat, since it is a flat pace', () => {
    expect(recordRow('run', record, { label: '20 min', grade: null }).tags).toEqual(['Flat'])
  })

  it('tags a ride’s watts estimated when they did not come from a power meter', () => {
    const virtual = {
      ...record,
      value: '250 W',
      activity: { ...morningRun, powerSource: 'virtual' as const },
    }
    expect(recordRow('ride', virtual, { label: '20 min', grade: null }).tags).toEqual(['Estimated'])
  })

  it('tags a ride’s watts estimated when the ride is not in the result', () => {
    const gone = { ...record, value: '250 W', activity: null }
    expect(recordRow('ride', gone, { label: '20 min', grade: null }).tags).toEqual(['Estimated'])
  })

  it('leaves a measured ride’s watts untagged', () => {
    const measured = {
      ...record,
      value: '250 W',
      activity: { ...morningRun, powerSource: 'measured' as const },
    }
    expect(recordRow('ride', measured, { label: '20 min', grade: null }).tags).toEqual([])
  })

  it('carries the label, figure, second reading, grade and activity of the record', () => {
    const row = recordRow(
      'run',
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
