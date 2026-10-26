// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RejectedFile } from '@rca/core/session'
import { RejectedFiles } from './RejectedFiles'
import type { RejectedFilesProps } from './RejectedFiles'

afterEach(() => {
  cleanup()
})

/** Renders the skipped files with the count the summary gives: every file listed, and those counted. */
function Skipped(props: Omit<RejectedFilesProps, 'count'>) {
  const count = props.rejected.length + (props.duplicates?.length ?? 0) + props.unsupportedFiles
  return <RejectedFiles count={count} {...props} />
}

function skipped(fileName: string, code: RejectedFile['code'], detail?: string): RejectedFile {
  return { fileName, reason: 'core reason', code, detail }
}

describe('RejectedFiles: what was skipped, and why', () => {
  it('says how many files were skipped, with the groups in a disclosure', () => {
    render(
      <Skipped
        rejected={[skipped('notes.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[skipped('copy.gpx', 'duplicate', 'run.fit')]}
      />,
    )

    expect(screen.getByText('2 files skipped.').closest('summary')).not.toBeNull()
    expect(screen.getByText('Not an activity file: 1 file')).toBeInTheDocument()
    expect(screen.getByText('Already added: 1 file')).toBeInTheDocument()
  })

  it('names each file beside its own plain reason, not the core reason', () => {
    render(
      <Skipped rejected={[skipped('bad.fit', 'corrupt')]} unsupportedFiles={0} duplicates={[]} />,
    )

    expect(
      screen.getAllByText('bad.fit: Damaged, so it could not be read.').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('core reason', { exact: false })).not.toBeInTheDocument()
  })

  it('gives each group one suggested action', () => {
    render(
      <Skipped
        rejected={[
          skipped('bad.fit', 'corrupt'),
          skipped('walk.fit', 'unsupported-sport', 'walking'),
        ]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(screen.getByText('Export the file again from your device or app.')).toBeInTheDocument()
    expect(
      screen.getByText('Only runs and rides are analysed, so these were left out on purpose.'),
    ).toBeInTheDocument()
  })

  it('counts files in a format the app does not read, without naming them', () => {
    render(<Skipped rejected={[]} unsupportedFiles={2} duplicates={[]} />)

    expect(screen.getByText('2 files skipped.')).toBeInTheDocument()
    expect(screen.getByText('Not an activity file: 2 files')).toBeInTheDocument()
  })

  it('names a sport in words and says it was left out on purpose', () => {
    render(
      <Skipped
        rejected={[skipped('swim.fit', 'unsupported-sport', 'swimming')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(
      screen.getAllByText('swim.fit: A swim is not a run or a ride, so it was left out on purpose.')
        .length,
    ).toBeGreaterThan(0)
  })

  it('shows the first skipped file and its reason outside the disclosure', () => {
    render(
      <Skipped rejected={[skipped('empty.fit', 'empty')]} unsupportedFiles={0} duplicates={[]} />,
    )

    const first = document.querySelector('.rejected-files__first')
    expect(first).toHaveTextContent('empty.fit: It has no activity records in it.')
    expect(first?.closest('details')).toBeNull()
  })

  it('offers the guides beneath the list of skipped files, so a skipped file has a next step', () => {
    const { container } = render(
      <Skipped
        rejected={[skipped('notes.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    const guides = screen.getByRole('button', { name: 'How to get your files' })
    const list = container.querySelector('details')
    expect(list).not.toBeNull()
    expect(list!.compareDocumentPosition(guides) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists only the files after the first in the disclosure, since the first is shown above it', () => {
    const { container } = render(
      <Skipped
        rejected={[skipped('a.txt', 'not-activity'), skipped('b.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    const details = container.querySelector('details')!
    const reason = 'Not a FIT, GPX or TCX file, so it cannot be read.'
    expect(within(details).queryByText(`a.txt: ${reason}`)).not.toBeInTheDocument()
    expect(within(details).getByText(`b.txt: ${reason}`)).toBeInTheDocument()
    expect(screen.getByText('Not an activity file: 2 files')).toBeInTheDocument()
  })

  it('gives the count line first and the first file under it, after the disclosure', () => {
    const { container } = render(
      <Skipped rejected={[skipped('empty.fit', 'empty')]} unsupportedFiles={0} duplicates={[]} />,
    )

    const root = container.querySelector('.rejected-files')!
    const first = root.querySelector('.rejected-files__first')!
    expect(root.firstElementChild?.tagName).toBe('DETAILS')
    expect(
      root.querySelector('details')!.compareDocumentPosition(first) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders nothing when no file was skipped', () => {
    const { container } = render(<Skipped rejected={[]} unsupportedFiles={0} duplicates={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
