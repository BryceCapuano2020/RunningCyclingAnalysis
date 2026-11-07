// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeActivity } from '../components/fixtures'
import { rowValue } from '../test/propertyRows'
import { ActivityIssues } from './ActivityIssues'

describe('ActivityIssues', () => {
  afterEach(cleanup)

  it('shows nothing for an activity with no notes', () => {
    const { container } = render(<ActivityIssues activity={makeActivity()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('notes heart rate set aside, under Data notes, as a row, on an activity with no flags', () => {
    render(<ActivityIssues activity={makeActivity()} setAside />)
    expect(screen.getByRole('heading', { name: 'Data notes' })).toBeInTheDocument()
    expect(rowValue(document.body, 'Heart rate')).toBe('Left out of the checks')
  })

  it('gives each kind a row with its count and what was done, then a row for each reading with its time', () => {
    const activity = makeActivity({
      flagCounts: { 'hr-spike': 2 },
      flags: [
        { kind: 'hr-spike', start: 100, end: 110, message: '' },
        { kind: 'hr-spike', start: 300, end: 302, message: '' },
      ],
    })
    render(<ActivityIssues activity={activity} />)
    expect(screen.getByRole('heading', { name: 'Skipped readings' })).toBeInTheDocument()
    expect(rowValue(document.body, 'Heart rate jumps')).toBe('2 times, left out')
    expect(rowValue(document.body, 'Heart rate jumps 1')).toBe('from 1:40 to 1:50, 10 s')
    expect(rowValue(document.body, 'Heart rate jumps 2')).toMatch(/^from 5:00 to 5:02/)
    expect(rowValue(document.body, 'Listed')).toBeNull()
  })

  it('says how many are listed when the digest kept fewer flags than were found', () => {
    const activity = makeActivity({
      flagCounts: { 'power-spike': 40 },
      flags: [{ kind: 'power-spike', start: 10, end: 11, message: '' }],
    })
    render(<ActivityIssues activity={activity} />)
    expect(rowValue(document.body, 'Listed')).toBe('1 of 40')
  })
})
