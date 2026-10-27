// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SET_ASIDE_ACTIVITY_TEXT } from '../analysis/setAsideCopy'
import { makeActivity } from '../components/fixtures'
import { ActivityIssues } from './ActivityIssues'

describe('ActivityIssues', () => {
  afterEach(cleanup)

  it('shows nothing for an activity with no notes', () => {
    const { container } = render(<ActivityIssues activity={makeActivity()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('notes heart rate set aside, under Data notes, on an activity with no flags', () => {
    render(<ActivityIssues activity={makeActivity()} heartRateSetAside />)
    expect(screen.getByRole('heading', { name: 'Data notes' })).toBeInTheDocument()
    expect(screen.getByText(SET_ASIDE_ACTIVITY_TEXT)).toBeInTheDocument()
  })
})
