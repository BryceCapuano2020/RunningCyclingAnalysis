// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeActivity } from '../components/fixtures'
import { ActivityIssues } from './ActivityIssues'

describe('ActivityIssues', () => {
  afterEach(cleanup)

  it('shows nothing for an activity with no notes', () => {
    const { container } = render(<ActivityIssues activity={makeActivity()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('notes heart rate set aside, under Data notes, on an activity with no flags', () => {
    render(<ActivityIssues activity={makeActivity()} setAsideNote="Heart rate left out." />)
    expect(screen.getByRole('heading', { name: 'Data notes' })).toBeInTheDocument()
    expect(screen.getByText('Heart rate left out.')).toBeInTheDocument()
  })
})
