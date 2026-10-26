// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { ChartTable } from './ChartTable'

const tableCss = await readStylesheet(import.meta.url, './ChartTable.css')

afterEach(() => {
  cleanup()
})

describe('ChartTable', () => {
  it('renders each column as a column header and each row as a row of cells', () => {
    render(<ChartTable columns={['Duration', 'Median']} rows={[['1 min', '+5%']]} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((th) => th.textContent)).toEqual(['Duration', 'Median'])
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'))
    // The first cell of each row names it, so it is a row header; the rest are cells.
    const rowHeader = screen.getByRole('rowheader')
    expect(rowHeader).toHaveTextContent('1 min')
    expect(rowHeader).toHaveAttribute('scope', 'row')
    expect(screen.getAllByRole('cell').map((td) => td.textContent)).toEqual(['+5%'])
  })

  it('right-aligns the numeric columns and leaves the label column alone', () => {
    render(<ChartTable columns={['Duration', 'Median']} rows={[['1 min', '+5%']]} />)
    expect(screen.getByRole('rowheader')).not.toHaveClass('num')
    expect(screen.getByRole('cell')).toHaveClass('num')
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

  it('makes a long table a scroll region a keyboard reader can reach', () => {
    const rows = Array.from({ length: 13 }, (_, i) => [`Week ${i}`, String(i)])
    const { container } = render(<ChartTable columns={['Week', 'Value']} rows={rows} />)
    const region = container.querySelector('.table-scroll')
    expect(region).toHaveClass('table-scroll--long')
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('leaves a short table out of the focus order, since it does not overflow', () => {
    const { container } = render(<ChartTable columns={['Week']} rows={[['Week 1']]} />)
    expect(container.querySelector('.table-scroll')).not.toHaveAttribute('tabindex')
  })

  it('makes a table that overflows its region a keyboard scroll region, named by its caption', () => {
    // A ResizeObserver that reports at once, as a browser does on the first measurement.
    class MeasuringObserver {
      private readonly callback: () => void

      constructor(callback: () => void) {
        this.callback = callback
      }

      observe() {
        this.callback()
      }

      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MeasuringObserver)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(520)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const { container } = render(
      <ChartTable
        caption="Weeks"
        columns={['Week', 'Grade', 'Runs']}
        rows={[['Week 1', '60%', '2']]}
      />,
    )
    const region = container.querySelector('.table-scroll')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveAttribute('role', 'region')
    expect(region).toHaveAttribute('aria-label', 'Weeks')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sets a text column on the left, where a numeric one is set on the right', () => {
    render(
      <ChartTable
        columns={['Duration', 'Power', 'From']}
        rows={[['20 min', '250 W', 'Hill ride']]}
        textColumns={[2]}
      />,
    )
    const [, powerHead, fromHead] = screen.getAllByRole('columnheader')
    expect(powerHead).toHaveClass('num')
    expect(fromHead).not.toHaveClass('num')
    expect(screen.getByRole('cell', { name: 'Hill ride' })).not.toHaveClass('num')
  })

  it('marks the columns a phone hides, and hides them in a stylesheet at the phone width', () => {
    const { container } = render(
      <ChartTable
        columns={['Week', 'Grade', 'Runs']}
        rows={[['Sun 12 Jan', '60%', '2']]}
        phoneHidden={[2]}
      />,
    )
    expect(container.querySelectorAll('.chart-table__phone-hidden')).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Runs' })).toHaveClass(
      'chart-table__phone-hidden',
    )
    expect(tableCss).toMatch(
      /@media \(max-width: 560px\) \{\s*\.chart-table__phone-hidden \{\s*display: none;/,
    )
  })
})
