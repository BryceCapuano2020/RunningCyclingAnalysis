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
      screen.getAllByText('bad.fit: Damaged, so it could not be read. Export it again.').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('core reason', { exact: false })).not.toBeInTheDocument()
  })

  it('gives each group one suggested action', () => {
    render(
      <Skipped
        rejected={[
          skipped('bad.fit', 'corrupt'),
          skipped('bad2.fit', 'corrupt'),
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

  it('does not repeat the group action for a lone damaged file, since its line already says to export it again', () => {
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

    expect(
      screen.queryByText('Export the file again from your device or app.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('bad.fit: Damaged, so it could not be read. Export it again.'),
    ).toBeInTheDocument()
  })

  it('says the export advice once: in the group action, not in the lines, when a group has two or more damaged files', () => {
    render(
      <Skipped
        rejected={[skipped('bad.fit', 'corrupt'), skipped('bad2.fit', 'corrupt')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(screen.getByText('Export the file again from your device or app.')).toBeInTheDocument()
    expect(screen.queryAllByText(/Export it again/)).toHaveLength(0)
    expect(screen.getByText('bad2.fit: Damaged, so it could not be read.')).toBeInTheDocument()
  })

  it('keeps the advice in the line of a lone damaged file that is not first, and drops its group action', () => {
    render(
      <Skipped
        rejected={[skipped('notes.txt', 'not-activity'), skipped('bad.fit', 'corrupt')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(
      screen.queryByText('Export the file again from your device or app.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('bad.fit: Damaged, so it could not be read. Export it again.'),
    ).toBeInTheDocument()
  })

  it('says the shorter-range advice once when a group has two or more too-large files', () => {
    render(
      <Skipped
        rejected={[
          skipped('big.fit', 'too-large', String(64 * 1024 ** 2)),
          skipped('big2.fit', 'too-large', String(64 * 1024 ** 2)),
        ]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(
      screen.getByText('Check the recording on your device, or export a shorter range.'),
    ).toBeInTheDocument()
    expect(screen.queryAllByText(/Export a shorter range\./)).toHaveLength(0)
    expect(screen.getByText('big2.fit: Too large to read (over 64 MB).')).toBeInTheDocument()
  })

  it('says the shorter-range advice once when a group has two or more too-much-data files', () => {
    render(
      <Skipped
        rejected={[skipped('a.fit', 'too-much-data'), skipped('b.fit', 'too-much-data')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(screen.queryAllByText(/Export a shorter range\./)).toHaveLength(0)
    expect(screen.getByText('b.fit: Too much data for one file.')).toBeInTheDocument()
  })

  it('keeps the shorter-range advice in the line of a lone too-large file, and drops its group action', () => {
    render(
      <Skipped
        rejected={[
          skipped('notes.txt', 'not-activity'),
          skipped('big.fit', 'too-large', String(64 * 1024 ** 2)),
        ]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(
      screen.queryByText('Check the recording on your device, or export a shorter range.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('big.fit: Too large to read (over 64 MB). Export a shorter range.'),
    ).toBeInTheDocument()
  })

  it('keeps the group action for a lone first file whose line gives no action', () => {
    render(
      <Skipped
        rejected={[skipped('notes.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    expect(
      screen.getByText('Export your activities as FIT, GPX or TCX files, then add them again.'),
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

  it('shows the first skipped file and its reason under the count line, in both states', () => {
    const { container } = render(
      <Skipped rejected={[skipped('empty.fit', 'empty')]} unsupportedFiles={0} duplicates={[]} />,
    )

    const summary = container.querySelector('summary')!
    expect(summary.querySelector('.rejected-files__first')).toHaveTextContent(
      'empty.fit: It has no activity records in it.',
    )
    expect(within(summary).getByText('1 file skipped.')).toBeInTheDocument()
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

  it('lists only the files after the first in the groups, since the first is shown under the count line', () => {
    const { container } = render(
      <Skipped
        rejected={[skipped('a.txt', 'not-activity'), skipped('b.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    const list = container.querySelector<HTMLElement>('.rejected-files__list')!
    const reason = 'Not a FIT, GPX or TCX file, so it cannot be read.'
    expect(within(list).queryByText(`a.txt: ${reason}`)).not.toBeInTheDocument()
    expect(within(list).getByText(`b.txt: ${reason}`)).toBeInTheDocument()
    expect(screen.getByText('Not an activity file: 2 files')).toBeInTheDocument()
  })

  it('gives the count line, then the first file, above the groups in both states', () => {
    const { container } = render(
      <Skipped
        rejected={[skipped('a.txt', 'not-activity'), skipped('b.txt', 'not-activity')]}
        unsupportedFiles={0}
        duplicates={[]}
      />,
    )

    const summary = container.querySelector('summary')!
    const count = within(summary).getByText('2 files skipped.')
    const first = summary.querySelector('.rejected-files__first')!
    const group = container.querySelector('.rejected-files__group')!
    expect(count.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(first.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders nothing when no file was skipped', () => {
    const { container } = render(<Skipped rejected={[]} unsupportedFiles={0} duplicates={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
