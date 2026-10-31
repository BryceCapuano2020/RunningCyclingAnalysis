// @vitest-environment jsdom
import { act, cleanup, render as plainRender, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RejectedFile } from '@rca/core/session'
import { openDisclosures } from '../test/openDisclosures'
import { RejectedFiles } from './RejectedFiles'

afterEach(() => {
  cleanup()
})

/** Renders, then opens the disclosures, which is how every list below is read. */
function render(ui: ReactElement) {
  const view = plainRender(ui)
  openDisclosures()
  return view
}

interface SkippedProps {
  rejected?: RejectedFile[]
  unsupportedFiles?: number
  duplicates?: RejectedFile[]
  /** Files added, which are not the copies left out. */
  added?: number
  unlisted?: number
  /** The files in a format the app does not read, by extension. */
  types?: Record<string, number>
}

const NONE: RejectedFile[] = []

/** Renders the skipped files of an import whose counts agree with the files it lists. */
function Skipped({
  rejected = NONE,
  unsupportedFiles = 0,
  duplicates = NONE,
  added = 0,
  unlisted,
  types,
}: SkippedProps) {
  const outcome = {
    filesAdded: added,
    rejected: rejected.length + unsupportedFiles,
    duplicates,
    notActivities: unlisted,
    skippedTypes: types,
  }
  return <RejectedFiles outcome={outcome} rejected={rejected} unsupportedFiles={unsupportedFiles} />
}

function skipped(fileName: string, code: RejectedFile['code'], detail?: string): RejectedFile {
  return { fileName, reason: 'core reason', code, detail }
}

/** `count` files of one sport, named the way a FIT file names it. */
function sportFiles(count: number, detail: string): RejectedFile[] {
  return Array.from({ length: count }, (_, i) =>
    skipped(`${detail}/${i}.fit`, 'unsupported-sport', detail),
  )
}

describe('RejectedFiles: the headline adds up', () => {
  it('says how many files were read and where each went, over the groups it opens', () => {
    render(
      <Skipped
        added={9}
        rejected={[skipped('empty.gpx', 'empty'), ...sportFiles(2, 'hiking')]}
        unlisted={4}
      />,
    )

    const headline = screen.getByText(
      '16 files, 12 of them activity files: 9 added, 1 needs a look, 2 other sports left out on purpose, 4 not listed as activities.',
    )
    expect(headline.closest('details')).not.toBeNull()
  })

  it("adds up the owner's export, 3,018 files with 320 files its list does not name among them", () => {
    render(
      <Skipped
        added={1915}
        rejected={[
          ...sportFiles(748, 'training'),
          skipped('activities/19682145057.gpx', 'empty'),
          skipped('activities/486884001.gpx', 'too-short'),
          skipped('activities/2187381745.tcx', 'too-short'),
          ...Array.from({ length: 32 }, (_, i) => skipped(`activities/${i}.gpx`, 'no-sport')),
        ]}
        unlisted={320}
      />,
    )

    expect(
      screen.getByText(
        '3,018 files, 2,698 of them activity files: 1,915 added, 35 need a look, 748 other sports left out on purpose, 320 not listed as activities.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Need a look: 35 files')).toBeInTheDocument()
    expect(screen.getByText('Other sports, left out on purpose: 748 files')).toBeInTheDocument()
    expect(
      screen.getByText('Not listed as activities, such as saved routes: 320 files'),
    ).toBeInTheDocument()
  })

  it('renders nothing when every file was added', () => {
    const { container } = render(<Skipped added={5} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RejectedFiles: one line and a disclosure', () => {
  it('says in one line what needs a look, and keeps the headline and every file under it', () => {
    const { container } = render(
      <Skipped
        added={1}
        rejected={[
          skipped('walk.fit', 'unsupported-sport', 'walking'),
          skipped('empty.gpx', 'empty'),
          skipped('short.gpx', 'too-short'),
        ]}
      />,
    )

    const summary = container.querySelector('summary')!
    expect(summary).toHaveTextContent(/^2 files need a look$/)
    expect(container.querySelectorAll('details > summary')).toHaveLength(2)
    expect(within(container.querySelector('details')!).getByText(/^4 files:/)).toBeInTheDocument()
  })

  it('lists each file that needs a look once, in the list, with none shown beside the summary', () => {
    const { container } = render(
      <Skipped rejected={[skipped('a.gpx', 'empty'), skipped('b.gpx', 'empty')]} />,
    )

    const reason = 'It holds no recorded points, so there is nothing to read.'
    expect(screen.getAllByText(`a.gpx: ${reason}`)).toHaveLength(1)
    expect(screen.getAllByText(`b.gpx: ${reason}`)).toHaveLength(1)
    const list = container.querySelector<HTMLElement>('.rejected-files__list')!
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(container.querySelector('summary')).not.toHaveTextContent('a.gpx')
  })

  it('names what was left out when no file needs a look, and the copies when nothing else is', () => {
    const sports = render(<Skipped added={1} rejected={sportFiles(2, 'hiking')} />)
    expect(sports.container.querySelector('summary')).toHaveTextContent(
      /^2 files of other sports left out$/,
    )
    sports.unmount()
    const copies = render(
      <Skipped added={3} duplicates={[skipped('copy.gpx', 'duplicate', 'run.fit')]} />,
    )
    expect(copies.container.querySelector('summary')).toHaveTextContent(/^1 copy already added$/)
  })

  it('holds no list while it is shut, so copying the page does not paste a column of empty bullets', () => {
    plainRender(
      <Skipped added={1} rejected={[skipped('empty.gpx', 'empty'), ...sportFiles(30, 'hiking')]} />,
    )

    expect(document.querySelectorAll('li')).toHaveLength(0)
    openDisclosures()
    const items = Array.from(document.querySelectorAll('li'))
    expect(items.length).toBeGreaterThan(30)
    for (const item of items) expect(item.textContent?.trim()).not.toBe('')
  })

  it('makes the list of other-sport files when Show the files opens, and drops it when it shuts', () => {
    plainRender(<Skipped added={1} rejected={sportFiles(2, 'hiking')} />)
    openDisclosures()
    const nested = screen.getByText('Show the files').closest('details')!
    expect(within(nested).getAllByRole('listitem')).toHaveLength(2)

    act(() => {
      nested.removeAttribute('open')
      nested.dispatchEvent(new Event('toggle'))
    })
    expect(within(nested).queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('RejectedFiles: the files that need a look', () => {
  it('lists one line for each file, in the group itself rather than behind another disclosure', () => {
    const { container } = render(
      <Skipped
        rejected={[
          skipped('a.gpx', 'empty'),
          skipped('b.gpx', 'too-short'),
          skipped('c.gpx', 'no-sport'),
        ]}
      />,
    )

    const group = screen.getByText('Need a look: 3 files').closest('.rejected-files__group')!
    const lines = within(group as HTMLElement).getAllByRole('listitem')
    expect(lines).toHaveLength(3)
    expect(lines[0]!.closest('details')).toBe(container.querySelector('details'))
  })

  it('says an empty file holds no points, and does not tell its owner to export it again', () => {
    render(<Skipped rejected={[skipped('empty.gpx', 'empty')]} />)

    expect(
      screen.getByText('empty.gpx: It holds no recorded points, so there is nothing to read.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/activity records/)).not.toBeInTheDocument()
  })

  it('gives a file that does not say its sport its own reason, and does not call it left out on purpose', () => {
    render(
      <Skipped rejected={[skipped('x.gpx', 'no-sport'), skipped('y.gpx', 'no-sport')]} added={1} />,
    )

    expect(
      screen.getAllByText(/It does not say whether it is a run or a ride, so it is not guessed\./)
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Need a look: 2 files')).toBeInTheDocument()
    expect(screen.queryByText(/Other sports/)).not.toBeInTheDocument()
    expect(screen.queryByText(/on purpose/)).not.toBeInTheDocument()
  })

  it('names a damaged file beside its own plain reason, not the core reason', () => {
    render(<Skipped rejected={[skipped('bad.fit', 'corrupt')]} />)

    expect(
      screen.getAllByText('bad.fit: Damaged, so it could not be read. Export it again.').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('core reason', { exact: false })).not.toBeInTheDocument()
  })

  it('says each piece of advice once, in the first line that gives it', () => {
    render(
      <Skipped
        rejected={[
          skipped('bad.fit', 'corrupt'),
          skipped('bad2.fit', 'corrupt'),
          skipped('big.fit', 'too-large', String(64 * 1024 ** 2)),
          skipped('big2.fit', 'too-much-data'),
          skipped('short.fit', 'too-short'),
          skipped('short2.fit', 'too-short'),
        ]}
      />,
    )

    expect(screen.queryAllByText(/Export it again\./)).toHaveLength(1)
    expect(screen.getByText(/^big\.fit: .*Export a shorter range\.$/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'big2.fit: Too much data for one file. Check the recording on your device, or export a shorter range.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'short.fit: Too short: it records less than a minute. Check the recording on your device.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryAllByText(/Check the recording on your device\./)).toHaveLength(1)
    expect(screen.getByText('bad2.fit: Damaged, so it could not be read.')).toBeInTheDocument()
    expect(
      screen.getByText('short2.fit: Too short: it records less than a minute.'),
    ).toBeInTheDocument()
  })

  it('shows no group action: the advice is in the lines', () => {
    const { container } = render(
      <Skipped rejected={[skipped('bad.fit', 'corrupt'), skipped('bad2.fit', 'corrupt')]} />,
    )
    expect(container.querySelector('.rejected-files__action')).toBeNull()
    expect(screen.queryByText('Export the file again from your device or app.')).toBeNull()
  })

  it('counts files in a format the app does not read, without naming them', () => {
    render(<Skipped unsupportedFiles={2} added={1} />)

    expect(screen.getByText(/^3 files: 1 added, 2 need a look\.$/)).toBeInTheDocument()
    expect(screen.getByText('Need a look: 2 files')).toBeInTheDocument()
    expect(
      screen.getByText(
        '2 files in a format this app does not read. Export your activities as FIT, GPX or TCX files, then add them again.',
      ),
    ).toBeInTheDocument()
  })

  it('names the formats of the files it does not read, when they account for all of them', () => {
    render(<Skipped unsupportedFiles={3} types={{ pwx: 2, kml: 1 }} />)

    expect(
      screen.getByText(/^3 files in a format this app does not read: 2 \.pwx, 1 \.kml\./),
    ).toBeInTheDocument()
  })

  it('names none when the formats do not add up to the files counted', () => {
    render(<Skipped unsupportedFiles={3} types={{ pwx: 1 }} />)

    expect(screen.getByText(/^3 files in a format this app does not read\./)).toBeInTheDocument()
  })

  it('says the export advice once when a named file and unnamed ones need it', () => {
    render(<Skipped rejected={[skipped('notes.txt', 'not-activity')]} unsupportedFiles={2} />)

    expect(screen.getAllByText(/Export your activities as FIT, GPX or TCX files/)).toHaveLength(1)
    expect(screen.getByText('2 files in a format this app does not read.')).toBeInTheDocument()
  })
})

describe('RejectedFiles: the other sports, left out on purpose', () => {
  it('is one line for each sport with its count, whichever source named it', () => {
    render(
      <Skipped
        added={1}
        rejected={[
          ...sportFiles(3, 'training'),
          skipped('w.gpx', 'unsupported-sport', 'Workout'),
          ...sportFiles(2, 'hiking'),
          skipped('x.fit', 'e-bike'),
        ]}
      />,
    )

    const group = screen
      .getByText('Other sports, left out on purpose: 7 files')
      .closest('.rejected-files__group') as HTMLElement
    const lines = within(group)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(lines.slice(0, 3)).toEqual(['Training session: 4', 'Hike: 2', 'E-bike ride: 1'])
  })

  it('puts the files behind a nested Show the files disclosure', () => {
    const { container } = render(<Skipped added={1} rejected={sportFiles(2, 'hiking')} />)

    const outer = container.querySelector('details')!
    const nested = screen.getByText('Show the files').closest('details')!
    expect(nested).not.toBe(outer)
    expect(outer).toContainElement(nested)
    expect(
      within(nested).getByText('hiking/0.fit: A hike is not a run or a ride.'),
    ).toBeInTheDocument()
    expect(within(nested).getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows a Strava type the table has no word for as it is, rather than as another sport', () => {
    const yoga = (name: string) => ({ ...skipped(name, 'unsupported-sport', 'Yoga'), listed: true })
    render(
      <Skipped
        added={1}
        rejected={[yoga('a.gpx'), yoga('b.gpx'), skipped('c.fit', 'unsupported-sport', 'kayaking')]}
      />,
    )

    const group = screen
      .getByText('Other sports, left out on purpose: 3 files')
      .closest('.rejected-files__group') as HTMLElement
    const lines = within(group)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(lines.slice(0, 2)).toEqual(['Yoga: 2', 'Another sport: 1'])
    expect(screen.getByText('a.gpx: Yoga is not a run or a ride.')).toBeInTheDocument()
  })

  it('names a Strava type in words, as a FIT sport is', () => {
    render(
      <Skipped added={1} rejected={[skipped('s.gpx', 'unsupported-sport', 'Weight Training')]} />,
    )
    expect(
      screen.getByText('s.gpx: A gym or fitness session is not a run or a ride.'),
    ).toBeInTheDocument()
  })

  it('gives the group no action', () => {
    const { container } = render(<Skipped added={1} rejected={sportFiles(2, 'hiking')} />)
    expect(container.querySelector('.rejected-files__action')).toBeNull()
  })
})

describe('RejectedFiles: files the export does not list, and copies already added', () => {
  it('says what the unlisted files are in one line with their count and no action', () => {
    const { container } = render(
      <Skipped
        added={1}
        rejected={[skipped('empty.gpx', 'empty'), skipped('short.gpx', 'too-short')]}
        unlisted={320}
      />,
    )

    const title = screen.getByText('Not listed as activities, such as saved routes: 320 files')
    const group = title.closest('.rejected-files__group')!
    expect(group.children).toHaveLength(1)
    expect(container.querySelector('.rejected-files__action')).toBeNull()
  })

  it('lists the groups in order: need a look, other sports, already added, not listed as activities', () => {
    render(
      <Skipped
        added={1}
        rejected={[
          ...sportFiles(1, 'hiking'),
          skipped('empty.gpx', 'empty'),
          skipped('short.gpx', 'too-short'),
        ]}
        duplicates={[skipped('copy.gpx', 'duplicate', 'run.fit')]}
        unlisted={2}
      />,
    )

    // The first three are headings, and the last is a line of text.
    const titles = screen.getAllByRole('heading').map((title) => title.textContent)
    expect(titles).toEqual([
      'Need a look: 2 files',
      'Other sports, left out on purpose: 1 file',
      'Already added: 1 file',
    ])
    const unlisted = screen.getByText('Not listed as activities, such as saved routes: 2 files')
    const copies = screen.getByRole('heading', { name: 'Already added: 1 file' })
    expect(copies.compareDocumentPosition(unlisted) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names a copy of a workout already added, with the one note on why', () => {
    render(<Skipped added={3} duplicates={[skipped('copy.gpx', 'duplicate', 'run.fit')]} />)

    expect(screen.getByText('4 files: 3 added, 1 already added.')).toBeInTheDocument()
    expect(
      screen.getByText('copy.gpx: Same workout as run.fit, so it was not counted twice.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Only one copy of a workout is kept, so these were not counted twice.'),
    ).toBeInTheDocument()
  })

  it('lists a file added again and a different file of the same workout, which the library already holds', () => {
    render(
      <Skipped
        duplicates={[
          skipped('run.fit', 'duplicate', 'run.fit'),
          skipped('copy.gpx', 'duplicate', 'run.fit'),
        ]}
      />,
    )

    expect(screen.getByText('2 files: 2 already added.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Already added: 2 files' })).toBeInTheDocument()
    expect(
      screen.getByText('run.fit: Already in your library, so it was not counted twice.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('copy.gpx: Same workout as run.fit, so it was not counted twice.'),
    ).toBeInTheDocument()
  })

  it('is plain text with nothing to open when files the export does not list are all that was left out', () => {
    const { container } = render(<Skipped added={1915} unlisted={320} />)

    expect(
      screen.getByText(
        '2,235 files, 1,915 of them activity files: 1,915 added, 320 not listed as activities.',
      ),
    ).toBeVisible()
    expect(container.querySelector('details')).toBeNull()
    expect(screen.queryByRole('button', { name: 'How to get your files' })).not.toBeInTheDocument()
  })
})

describe('RejectedFiles: the next step', () => {
  it('offers the guides beneath the groups, so a skipped file has a next step', () => {
    const { container } = render(
      <Skipped rejected={[skipped('a.txt', 'not-activity'), skipped('b.txt', 'not-activity')]} />,
    )

    const guides = screen.getByRole('button', { name: 'How to get your files' })
    const list = container.querySelector('details')
    expect(list).not.toBeNull()
    expect(list!.compareDocumentPosition(guides) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('RejectedFiles: a group that would have no lines', () => {
  it('lists a single file that needs a look under its title, once', () => {
    render(<Skipped added={3} rejected={[skipped('empty.gpx', 'empty')]} />)

    expect(screen.getByText('Need a look: 1 file')).toBeInTheDocument()
    expect(screen.getAllByText(/empty\.gpx/)).toHaveLength(1)
    expect(screen.getByText('4 files: 3 added, 1 needs a look.')).toBeInTheDocument()
  })

  it('lists a damaged file with its advice and still offers the guides', () => {
    render(<Skipped rejected={[skipped('bad.fit', 'corrupt')]} />)

    expect(
      screen.getByText('bad.fit: Damaged, so it could not be read. Export it again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How to get your files' })).toBeInTheDocument()
  })

  it('keeps the title when the files in a format the app does not read are a line of the group', () => {
    render(<Skipped rejected={[skipped('empty.gpx', 'empty')]} unsupportedFiles={2} />)

    expect(screen.getByText('Need a look: 3 files')).toBeInTheDocument()
    expect(screen.getByText(/^2 files in a format this app does not read/)).toBeInTheDocument()
  })

  it('does not leave an other-sports-only import with a title and nothing under it', () => {
    render(<Skipped added={1} rejected={sportFiles(2, 'hiking')} />)

    expect(screen.queryByText(/^Need a look/)).not.toBeInTheDocument()
    expect(screen.getByText('Hike: 2')).toBeInTheDocument()
  })
})

describe('RejectedFiles: the group titles are headings', () => {
  it('makes each title a level-two heading', () => {
    render(
      <Skipped
        added={1}
        rejected={[
          ...sportFiles(1, 'hiking'),
          skipped('a.gpx', 'empty'),
          skipped('b.gpx', 'empty'),
        ]}
        duplicates={[skipped('copy.gpx', 'duplicate', 'run.fit')]}
        unlisted={2}
      />,
    )

    const headings = screen.getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H2', 'H2', 'H2'])
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Need a look: 2 files',
      'Other sports, left out on purpose: 1 file',
      'Already added: 1 file',
    ])
  })

  it('leaves the line for files the export does not list as a paragraph, not a heading', () => {
    render(
      <Skipped
        added={1}
        rejected={[skipped('a.gpx', 'empty'), skipped('b.gpx', 'empty')]}
        unlisted={320}
      />,
    )

    const line = screen.getByText('Not listed as activities, such as saved routes: 320 files')
    expect(line.tagName).toBe('P')
    expect(screen.queryByRole('heading', { name: /Not listed/ })).not.toBeInTheDocument()
  })
})
