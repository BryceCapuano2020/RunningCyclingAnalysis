// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { DigestSplit } from '@rca/core/types'
import { SplitsTable } from './SplitsTable'

afterEach(cleanup)

const split = (seconds: number): DigestSplit => ({
  distanceM: 1000,
  seconds,
  gradeAdjustedSeconds: seconds,
  elevationGainM: 5,
  avgHeartRate: 150,
})

const show = (count: number) =>
  render(
    <SplitsTable
      load={{
        status: 'loaded',
        splits: { km: Array.from({ length: count }, (_, i) => split(300 + i)), mile: [] },
      }}
      units="metric"
      distanceM={count * 1000}
    />,
  )

describe('a long run’s splits', () => {
  it('shows twenty rows and folds the rest behind a button that names how many there are', async () => {
    const user = userEvent.setup()
    show(50)
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows()).toHaveLength(20)
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    const more = screen.getByRole('button', { name: 'Show all 50 splits' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(rows()).toHaveLength(50)
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Show the first 20 splits' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('has no button for twenty or fewer', () => {
    show(20)
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(20)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
