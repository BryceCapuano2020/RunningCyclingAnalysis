// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportOutcome } from '../../worker/protocol'
import type { MovedItem } from '../analysis/whatMoved'
import { ImportNotice } from './ImportNotice'
import type { ImportNoticeProps } from './ImportNotice'

afterEach(() => {
  cleanup()
})

const MARCH_2023 = new Date(2023, 2, 4, 9).getTime()
const OCTOBER_THIS_YEAR = new Date(new Date().getFullYear(), 9, 20, 7).getTime()
const ADDED: ImportOutcome = {
  activities: 800,
  rejected: 0,
  duplicates: [],
  runs: 412,
  rides: 388,
  firstStartMs: MARCH_2023,
  lastStartMs: OCTOBER_THIS_YEAR,
}
const SENTENCE = `Added 412 runs and 388 rides, from Mar 2023 to Oct ${new Date().getFullYear()}.`
const MOVED: MovedItem[] = [{ text: 'New best 20 min ride: 262 W' }]

function noticeProps(overrides: Partial<ImportNoticeProps> = {}): ImportNoticeProps {
  return {
    outcome: ADDED,
    busy: false,
    rejected: [],
    unsupportedFiles: 0,
    moved: [],
    atBalance: false,
    onDismiss: vi.fn(),
    ...overrides,
  }
}

describe('ImportNotice: the summary of an import', () => {
  it('shows what an import added as visible text, not only to screen readers', () => {
    render(<ImportNotice {...noticeProps()} />)
    expect(screen.getByText(SENTENCE).closest('[role="status"]')).toBeNull()
  })

  it('says an import that added no run or ride was nothing new', () => {
    render(
      <ImportNotice
        {...noticeProps({ outcome: { activities: 1, rejected: 0, duplicates: [] } })}
      />,
    )
    expect(screen.getByText('Nothing new: 1 activity already in your library.')).toBeVisible()
  })

  it('links to the balance from the other pages, but not from the balance page', () => {
    const { rerender } = render(<ImportNotice {...noticeProps()} />)
    expect(screen.getByRole('link', { name: 'See your balance' })).toHaveAttribute('href', '#/')

    rerender(<ImportNotice {...noticeProps({ atBalance: true })} />)
    expect(screen.queryByRole('link', { name: 'See your balance' })).not.toBeInTheDocument()
  })

  it('hides while an import is still running', () => {
    render(<ImportNotice {...noticeProps({ busy: true })} />)
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument()
  })

  it('lists what moved under the summary sentence', () => {
    render(<ImportNotice {...noticeProps({ moved: MOVED })} />)
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('New best 20 min ride: 262 W')
    expect(
      screen.getByText(SENTENCE).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows no list when nothing moved, or when the import added no run or ride', () => {
    const { rerender } = render(<ImportNotice {...noticeProps({ moved: [] })} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    rerender(
      <ImportNotice
        {...noticeProps({
          outcome: { activities: 1, rejected: 0, duplicates: [] },
          moved: MOVED,
        })}
      />,
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows the first skipped file inline, so its reason is not hidden in the disclosure', () => {
    render(
      <ImportNotice
        {...noticeProps({
          outcome: { activities: 800, rejected: 1, duplicates: [] },
          rejected: [{ fileName: 'notes.txt', reason: 'x', code: 'not-activity' }],
        })}
      />,
    )
    expect(document.querySelector('.rejected-files__first')).toHaveTextContent(
      'Not a FIT, GPX or TCX file, so it cannot be read.',
    )
  })
})

describe('ImportNotice: dismissal', () => {
  it('tells the page when the summary is dismissed, and removes it', () => {
    const onDismiss = vi.fn()
    render(<ImportNotice {...noticeProps({ onDismiss })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss summary' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument()
  })

  it('shows the summary again for the outcome of a later import', () => {
    const { rerender } = render(<ImportNotice {...noticeProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss summary' }))
    rerender(<ImportNotice {...noticeProps({ outcome: { ...ADDED } })} />)
    expect(screen.getByRole('button', { name: 'Dismiss summary' })).toBeInTheDocument()
  })

  it('removes the list of what moved with the summary', () => {
    render(<ImportNotice {...noticeProps({ moved: MOVED })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss summary' }))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('moves focus to the page heading when the dismiss button had it', () => {
    render(
      <>
        <h1 id="page-heading" tabIndex={-1}>
          Balance
        </h1>
        <ImportNotice {...noticeProps()} />
      </>,
    )
    const dismiss = screen.getByRole('button', { name: 'Dismiss summary' })
    dismiss.focus()
    fireEvent.click(dismiss)
    expect(screen.getByRole('heading', { name: 'Balance' })).toHaveFocus()
  })
})

describe('ImportNotice: skipped files', () => {
  it('says where every file went, counting the copies left out and the files the export does not list', () => {
    render(
      <ImportNotice
        {...noticeProps({
          outcome: {
            activities: 800,
            filesAdded: 799,
            rejected: 1,
            duplicates: [
              { fileName: 'copy.gpx', reason: 'x', code: 'duplicate', detail: 'run.fit' },
            ],
            notActivities: 320,
            runs: 412,
            rides: 388,
            firstStartMs: MARCH_2023,
            lastStartMs: OCTOBER_THIS_YEAR,
          },
          rejected: [{ fileName: 'notes.txt', reason: 'x', code: 'not-activity' }],
        })}
      />,
    )
    expect(
      screen.getByText(
        '1,121 files: 799 added, 1 needs a look, 1 already added, 320 not listed as activities.',
      ),
    ).toBeInTheDocument()
  })

  it('shows no line about files when every file was used', () => {
    render(<ImportNotice {...noticeProps()} />)
    expect(screen.queryByText(/^[\d,]+ files?: /)).not.toBeInTheDocument()
  })
})
