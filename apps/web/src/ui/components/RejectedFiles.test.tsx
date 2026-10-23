// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RejectedFile } from '@rca/core/session'
import { makeRejectedFile } from './fixtures'
import { RejectedFiles } from './RejectedFiles'

afterEach(() => {
  cleanup()
})

/** Count files that all share one reason, named file-1.zip, file-2.zip and so on. */
function manyRejected(count: number, reason = 'No FIT files found'): RejectedFile[] {
  return Array.from({ length: count }, (_, i) =>
    makeRejectedFile({ fileName: `file-${i + 1}.zip`, reason }),
  )
}

/** The expandable group whose summary text is the given text. */
function groupFor(summary: string): HTMLElement {
  const group = screen.getByText(summary).closest('details')
  if (!group) throw new Error(`no group for ${summary}`)
  return group
}

describe('RejectedFiles', () => {
  it('renders nothing when no files were rejected and none were skipped', () => {
    const { container } = render(<RejectedFiles rejected={[]} unsupportedFiles={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says how many unsupported files were skipped, singular', () => {
    render(<RejectedFiles rejected={[]} unsupportedFiles={1} />)
    expect(
      screen.getByText('1 file was skipped. Only FIT, GPX or TCX files can be read.'),
    ).toBeInTheDocument()
  })

  it('says how many unsupported files were skipped, plural', () => {
    render(<RejectedFiles rejected={[]} unsupportedFiles={3} />)
    expect(
      screen.getByText('3 files were skipped. Only FIT, GPX or TCX files can be read.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/could not be used/)).not.toBeInTheDocument()
  })

  it('shows the skipped-files sentence alongside rejected files', () => {
    render(<RejectedFiles rejected={manyRejected(1)} unsupportedFiles={2} />)
    expect(
      screen.getByText('2 files were skipped. Only FIT, GPX or TCX files can be read.'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 file could not be used')).toBeInTheDocument()
  })

  it('gives the total number of rejected files in the summary', () => {
    render(
      <RejectedFiles
        rejected={[
          makeRejectedFile({ fileName: 'a.fit', reason: 'No FIT files found' }),
          makeRejectedFile({ fileName: 'b.fit', reason: 'Could not read the file header' }),
        ]}
        unsupportedFiles={0}
      />,
    )
    expect(screen.getByText('2 files could not be used')).toBeInTheDocument()
  })

  it('groups rejected files by reason with a count for each reason', () => {
    render(
      <RejectedFiles
        rejected={[
          makeRejectedFile({ fileName: 'notes.txt', reason: 'No FIT files found' }),
          makeRejectedFile({ fileName: 'readme.zip', reason: 'No FIT files found' }),
          makeRejectedFile({ fileName: 'broken.fit', reason: 'Could not read the file header' }),
        ]}
        unsupportedFiles={0}
      />,
    )
    expect(screen.getByText('No FIT files found: 2 files')).toBeInTheDocument()
    expect(screen.getByText('Could not read the file header: 1 file')).toBeInTheDocument()
  })

  it('lists the file names inside their reason group', () => {
    render(
      <RejectedFiles
        rejected={[
          makeRejectedFile({ fileName: 'notes.txt', reason: 'No FIT files found' }),
          makeRejectedFile({ fileName: 'broken.fit', reason: 'Could not read the file header' }),
        ]}
        unsupportedFiles={0}
      />,
    )
    expect(
      within(groupFor('No FIT files found: 1 file')).getByText('notes.txt'),
    ).toBeInTheDocument()
    expect(
      within(groupFor('Could not read the file header: 1 file')).getByText('broken.fit'),
    ).toBeInTheDocument()
  })

  it('orders groups by the first time each reason appears', () => {
    const { container } = render(
      <RejectedFiles
        rejected={[
          makeRejectedFile({ fileName: 'a.fit', reason: 'Second reason' }),
          makeRejectedFile({ fileName: 'b.fit', reason: 'First reason' }),
          makeRejectedFile({ fileName: 'c.fit', reason: 'Second reason' }),
        ]}
        unsupportedFiles={0}
      />,
    )
    const summaries = Array.from(
      container.querySelectorAll('.rejected-files__group > summary'),
      (node) => node.textContent,
    )
    expect(summaries).toEqual(['Second reason: 2 files', 'First reason: 1 file'])
  })

  it('lists every name when a group has 50 or fewer files', () => {
    render(<RejectedFiles rejected={manyRejected(50)} unsupportedFiles={0} />)
    const group = groupFor('No FIT files found: 50 files')
    expect(within(group).getAllByRole('listitem')).toHaveLength(50)
    expect(within(group).getByText('file-50.zip')).toBeInTheDocument()
    expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument()
  })

  it('lists at most 50 names per group, then says how many more there are', () => {
    render(<RejectedFiles rejected={manyRejected(73)} unsupportedFiles={0} />)
    const group = groupFor('No FIT files found: 73 files')
    // 50 names plus the summary line for the rest.
    expect(within(group).getAllByRole('listitem')).toHaveLength(51)
    expect(within(group).getByText('file-50.zip')).toBeInTheDocument()
    expect(within(group).queryByText('file-51.zip')).not.toBeInTheDocument()
    expect(within(group).getByText('and 23 more')).toBeInTheDocument()
  })

  it('caps each group separately', () => {
    render(
      <RejectedFiles
        rejected={[
          ...manyRejected(51, 'Reason A'),
          ...manyRejected(2, 'Reason B').map((file) =>
            Object.assign({}, file, { fileName: `b-${file.fileName}` }),
          ),
        ]}
        unsupportedFiles={0}
      />,
    )
    expect(within(groupFor('Reason A: 51 files')).getByText('and 1 more')).toBeInTheDocument()
    expect(within(groupFor('Reason B: 2 files')).queryByText(/more/)).not.toBeInTheDocument()
  })

  it('uses the singular for one file', () => {
    render(<RejectedFiles rejected={[makeRejectedFile()]} unsupportedFiles={0} />)
    expect(screen.getByText('1 file could not be used')).toBeInTheDocument()
  })

  it('lists skipped duplicates under their reason, apart from the rejected files', () => {
    render(
      <RejectedFiles
        rejected={[]}
        unsupportedFiles={0}
        duplicates={[
          makeRejectedFile({ fileName: 'ride.gpx', reason: 'Same workout as ride.fit' }),
        ]}
      />,
    )
    expect(screen.getByText('1 file skipped as a copy of a better file')).toBeInTheDocument()
    expect(screen.queryByText(/could not be used/)).not.toBeInTheDocument()
    expect(groupFor('Same workout as ride.fit: 1 file')).toBeInTheDocument()
  })
})
