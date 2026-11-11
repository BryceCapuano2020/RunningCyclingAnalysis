// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { apart, ready, stateWith, types, stubFakeWorker, worker } from '../test/signedInAnalysis'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)

stubFakeWorker()

describe('the saves an earlier visit left behind', () => {
  it('has nothing to show until the worker says it is finishing some', () => {
    const { result } = ready()
    expect(result.current.outbox).toBeNull()
  })

  it('shows how many are left while they are saved, and how it ended', () => {
    const { result } = ready()
    apart({ type: 'outbox', pending: 5, saved: 0, failed: 0, finished: false })
    expect(result.current.outbox).toEqual({ pending: 5, saved: 0, failed: 0, finished: false })

    apart({ type: 'outbox', pending: 0, saved: 4, failed: 1, finished: true })
    expect(result.current.outbox).toEqual({ pending: 0, saved: 4, failed: 1, finished: true })
  })

  it('reads the library again once some were saved, so they show', () => {
    ready()
    const before = types().filter((type) => type === 'loadServer').length

    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })

    expect(types().filter((type) => type === 'loadServer')).toHaveLength(before + 1)
  })

  it('keeps the library loaded while it is read again, so a rename or a delete made meanwhile is not refused', () => {
    const { result } = ready()
    expect(result.current.libraryStatus).toBe('loaded')
    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })
    expect(types()).toContain('loadServer')
    expect(result.current.libraryStatus).toBe('loaded')
  })

  it('sets the library to loading when it is read again from a failed one, so imports wait for it', () => {
    const { result } = ready()
    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })
    act(() => worker().reply({ type: 'error', message: 'Library down' }))
    expect(result.current.libraryStatus).toBe('failed')
    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })
    expect(result.current.libraryStatus).toBe('loading')
  })

  it('does not read it again when none were saved', () => {
    ready()
    const before = types().length
    apart({ type: 'outbox', pending: 0, saved: 0, failed: 2, finished: true })
    expect(types()).toHaveLength(before)
  })

  it('does not read it again while an import is running', () => {
    const { result } = ready()
    act(() => result.current.addFiles([new File(['x'], 'run.fit')]))
    expect(types()).toContain('addFiles')
    const before = types().filter((type) => type === 'loadServer').length

    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })

    expect(types().filter((type) => type === 'loadServer')).toHaveLength(before)
  })

  it('is replaced by the next import', async () => {
    const { result } = ready()
    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })
    // The library is read again for what was saved; the next import is sent once that read is done.
    act(() => worker().reply({ type: 'state', state: stateWith(3) }))
    expect(result.current.libraryStatus).toBe('loaded')
    act(() => result.current.addFiles([new File(['x'], 'run.fit')]))
    expect(types()).toContain('addFiles')
    await waitFor(() => expect(result.current.outbox).toBeNull())
  })
})
