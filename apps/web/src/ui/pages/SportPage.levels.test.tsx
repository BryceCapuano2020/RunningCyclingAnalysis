// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { makeActivity, makeResult } from '../components/test/fixtures'
import { SportPage } from './SportPage'
import type { AgeProfile } from '../grades'

afterEach(cleanup)

const PROFILE: AgeProfile = { birthYear: 1985, sex: 'female' }

function renderPage(sport: Sport, result: AnalysisResult, profile: AgeProfile | null) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      change={null}
      units="metric"
      massKg={62}
      weighted
      profile={profile}
      missingAge={profile === null ? 'year of birth and sex' : null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={result.activities.filter((activity) => activity.sport === sport).length}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

const RESULT = makeResult({
  activities: [
    makeActivity({ id: 'run-1', sport: 'run' }),
    makeActivity({ id: 'ride-1', sport: 'ride' }),
  ],
})

describe('SportPage: levels', () => {
  it.each([
    ['run', 'Half marathon', /or faster$/],
    ['ride', 'Threshold power', / W and up$/],
  ] as const)('gives the %s page a table of every level in its own figure', (sport, head, top) => {
    renderPage(sport, RESULT, PROFILE)
    const table = screen.getByRole('table', { name: new RegExp(head, 'i') })
    const rows = within(table).getAllByRole('row')
    // The header row, then the eight levels, World first.
    expect(rows).toHaveLength(9)
    expect(within(rows[0]!).getByRole('columnheader', { name: head })).toBeInTheDocument()
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('World')
    expect(within(rows[1]!).getAllByRole('cell')[0]!.textContent).toMatch(top)
    expect(within(rows[8]!).getByRole('rowheader')).toHaveTextContent('Recreational')
  })

  it('holds the table while the year of birth or sex is missing', () => {
    renderPage('run', RESULT, null)
    expect(screen.queryByRole('heading', { name: 'Levels' })).not.toBeInTheDocument()
  })
})
