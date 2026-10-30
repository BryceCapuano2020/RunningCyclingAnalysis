import { ORIGINALS_UNAVAILABLE } from '../analysis/copy'
import { describe, expect, it } from 'vitest'
import { heldLibraryView } from './heldLibraryView'

const none = { stale: 0, newer: 0, rebuildable: 0, unreadable: 0, busy: false }

describe('heldLibraryView', () => {
  it('offers Update now when saved files can rebuild the library', () => {
    const view = heldLibraryView({ ...none, stale: 3000, rebuildable: 3000 })
    expect(view.title).toBe('Update your library')
    expect(view.lines).toEqual([
      'A new version of the analysis is ready. Update your library to see your results.',
      '3,000 activities will be rebuilt from your saved files.',
    ])
    expect(view).toMatchObject({ update: true, addFiles: false })
  })

  it('says the results come back when a running update finishes', () => {
    const view = heldLibraryView({ ...none, stale: 10, rebuildable: 10, busy: true })
    expect(view.lines).toEqual(['Updating your library. Your results come back when it finishes.'])
  })

  it('says why Update now is off when original files cannot be kept', () => {
    const view = heldLibraryView({ ...none, stale: 3, rebuildable: 3, retention: false })
    expect(view.lines.at(-1)).toBe(ORIGINALS_UNAVAILABLE)
    expect(heldLibraryView({ ...none, stale: 3, rebuildable: 3 }).lines.join(' ')).not.toMatch(
      /cannot be read right now/,
    )
  })

  it('says what a library of no runs or rides holds', () => {
    expect(heldLibraryView(none).lines[0]).toBe(
      'This library holds no runs or rides yet. Add your files to see your results.',
    )
  })

  it('asks for the files of activities with no original, and offers both when some can be rebuilt', () => {
    const view = heldLibraryView({ ...none, stale: 412, rebuildable: 0 })
    expect(view.lines[0]).toBe(
      '412 activities need their files added again. Drop your export or the files; what is already saved is not uploaded again.',
    )
    expect(view).toMatchObject({ update: false, addFiles: true })
    const both = heldLibraryView({ ...none, stale: 5, rebuildable: 4 })
    expect(both).toMatchObject({ update: true, addFiles: true })
    expect(both.lines.at(-1)).toContain('1 activity needs its file added again')
  })

  it('tells a library made by a newer app to reload', () => {
    const view = heldLibraryView({ ...none, newer: 2 })
    expect(view.title).toBe('Your library needs a newer app')
    expect(view).toMatchObject({ update: false, addFiles: false })
  })

  it('says rows that could not be read need their files again, and never promises an update', () => {
    const view = heldLibraryView({ ...none, unreadable: 1 })
    expect(view.lines[0]).toContain('1 saved activity could not be read')
    expect(view.update).toBe(false)
  })
})
