// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartTable } from './ChartTable'

afterEach(() => {
  cleanup()
})

describe('ChartTable', () => {
  it('renders each column as a column header and each row as a row of cells', () => {
    render(<ChartTable columns={['Duration', 'Median']} rows={[['1 min', '+5%']]} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((th) => th.textContent)).toEqual(['Duration', 'Median'])
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'))
    const cells = screen.getAllByRole('cell')
    expect(cells.map((td) => td.textContent)).toEqual(['1 min', '+5%'])
  })

  it('right-aligns the numeric columns and leaves the label column alone', () => {
    render(<ChartTable columns={['Duration', 'Median']} rows={[['1 min', '+5%']]} />)
    const [label, value] = screen.getAllByRole('cell')
    expect(label).not.toHaveClass('num')
    expect(value).toHaveClass('num')
    const [labelHead, valueHead] = screen.getAllByRole('columnheader')
    expect(labelHead).not.toHaveClass('num')
    expect(valueHead).toHaveClass('num')
  })

  it('renders a row for each entry, in order, and an empty body when there are none', () => {
    const { container, unmount } = render(
      <ChartTable
        columns={['Block', 'Value']}
        rows={[
          ['a', '1'],
          ['b', '2'],
        ]}
      />,
    )
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.textContent)
    expect(rows).toEqual(['a1', 'b2'])
    unmount()

    const { container: empty } = render(<ChartTable columns={['Block']} rows={[]} />)
    expect(empty.querySelectorAll('tbody tr')).toHaveLength(0)
    expect(empty.querySelectorAll('thead th')).toHaveLength(1)
  })

  it('names the table with a caption when one is given', () => {
    render(<ChartTable caption="Summary" columns={['Sport']} rows={[['Running']]} />)
    expect(screen.getByRole('table', { name: 'Summary' })).toBeInTheDocument()
  })

  it('sits in a horizontally scrollable wrapper, so wide tables do not widen the page', () => {
    const { container } = render(<ChartTable columns={['A']} rows={[['1']]} />)
    expect(container.firstElementChild).toHaveClass('table-scroll')
  })
})
