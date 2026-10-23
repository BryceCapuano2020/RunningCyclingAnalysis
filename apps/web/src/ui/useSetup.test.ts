// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountStatus } from './useAccount'
import type { SetupOptions } from './useSetup'
import { useSetup } from './useSetup'

const DEVICE_KEY = 'rca.setup.v1'

function file(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

interface Props {
  status: AccountStatus
  preferencesDone: boolean
  workerStopped: boolean
}

const SIGNED_OUT: Props = { status: 'signed-out', preferencesDone: false, workerStopped: false }

/** A hook whose options can change between renders, as App's do when the account or saves change. */
function renderSetup(initial: Partial<Props> = {}) {
  const addFiles = vi.fn<(files: File[]) => void>()
  const save = vi.fn<SetupOptions['save']>(async () => undefined)
  const view = renderHook((props: Props) => useSetup({ ...props, addFiles, save }), {
    initialProps: { ...SIGNED_OUT, ...initial },
  })
  return { ...view, addFiles, save }
}

function names(addFiles: { mock: { calls: unknown[][] } }): string[] {
  const [files] = addFiles.mock.calls[0] as [File[]]
  return files.map((held) => held.name)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSetup, signed out', () => {
  it('holds files and asks, until the setup is answered', () => {
    const { result, addFiles } = renderSetup()
    expect(result.current.open).toBe(false)

    act(() => result.current.requestImport([file('a.fit')]))

    expect(result.current.open).toBe(true)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('appends further drops while the dialog is open, and sends them all together', async () => {
    const { result, addFiles, rerender } = renderSetup()
    act(() => result.current.requestImport([file('a.fit')]))
    act(() => result.current.requestImport([file('b.gpx'), file('c.tcx')]))
    expect(addFiles).not.toHaveBeenCalled()
    expect(result.current.open).toBe(true)

    await act(() => result.current.finish({}))
    rerender({ ...SIGNED_OUT, preferencesDone: true })

    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(names(addFiles)).toEqual(['a.fit', 'b.gpx', 'c.tcx'])
  })

  it('saves the answers with setup marked done, and closes once the saved preferences say so', async () => {
    const { result, save, rerender } = renderSetup()
    act(() => result.current.requestImport([file('a.fit')]))

    await act(() => result.current.finish({ settings: { massKg: 82, bikeMassKg: 9 } }))

    expect(save).toHaveBeenCalledWith({ settings: { massKg: 82, bikeMassKg: 9 }, setupDone: true })
    rerender({ ...SIGNED_OUT, preferencesDone: true })
    expect(result.current.open).toBe(false)
  })

  it('sends the held files only once the answers are in place, not before', async () => {
    const { result, addFiles, rerender } = renderSetup()
    act(() => result.current.requestImport([file('a.fit')]))
    await act(() => result.current.finish({}))
    // The save has not reached the preferences yet, so the files still wait.
    expect(addFiles).not.toHaveBeenCalled()

    rerender({ ...SIGNED_OUT, preferencesDone: true })
    expect(addFiles).toHaveBeenCalledTimes(1)
  })

  it('adds files at once, without asking, once setup is done', () => {
    const { result, addFiles } = renderSetup({ preferencesDone: true })

    act(() => result.current.requestImport([file('a.fit')]))

    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(result.current.open).toBe(false)
  })

  it('ignores an empty list of files', () => {
    const { result, addFiles } = renderSetup()
    act(() => result.current.requestImport([]))
    expect(result.current.open).toBe(false)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('does not write the signed-in device flag while signed out', async () => {
    const { result } = renderSetup()
    act(() => result.current.requestImport([file('a.fit')]))
    await act(() => result.current.finish({}))
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull()
  })
})

describe('useSetup, while the account loads', () => {
  it('holds drops without opening the dialog, since the answer depends on the account', () => {
    const { result, addFiles } = renderSetup({ status: 'loading' })

    act(() => result.current.requestImport([file('a.fit')]))

    expect(result.current.open).toBe(false)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('asks once the account is known to be signed in, when this device has not answered', () => {
    const { result, addFiles, rerender } = renderSetup({ status: 'loading' })
    act(() => result.current.requestImport([file('a.fit')]))

    rerender({ ...SIGNED_OUT, status: 'signed-in' })

    expect(result.current.open).toBe(true)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('sends the files without asking when the signed-in device has already answered', () => {
    localStorage.setItem(DEVICE_KEY, '1')
    const { result, addFiles, rerender } = renderSetup({ status: 'loading' })
    act(() => result.current.requestImport([file('a.fit')]))

    rerender({ ...SIGNED_OUT, status: 'signed-in' })

    expect(result.current.open).toBe(false)
    expect(addFiles).toHaveBeenCalledTimes(1)
  })

  it('sends the files without asking when signed out and answered here, once the account is known', () => {
    const { result, addFiles, rerender } = renderSetup({
      status: 'loading',
      preferencesDone: true,
    })
    act(() => result.current.requestImport([file('a.fit')]))
    expect(addFiles).not.toHaveBeenCalled()

    rerender({ ...SIGNED_OUT, preferencesDone: true })

    expect(result.current.open).toBe(false)
    expect(addFiles).toHaveBeenCalledTimes(1)
  })
})

describe('useSetup, the files it holds', () => {
  it('counts the files waiting while the account loads, and clears the count once they are sent', () => {
    const { result, addFiles, rerender } = renderSetup({ status: 'loading' })
    expect(result.current.held).toBe(0)

    act(() => result.current.requestImport([file('a.fit')]))
    act(() => result.current.requestImport([file('b.gpx')]))
    expect(result.current.held).toBe(2)

    rerender({ ...SIGNED_OUT, preferencesDone: true })
    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(result.current.held).toBe(0)
  })

  it('counts the files waiting for the answer, and keeps them when the save is refused', async () => {
    const { result, save } = renderSetup()
    save.mockRejectedValueOnce(new Error('Try again'))
    act(() => result.current.requestImport([file('a.fit'), file('b.gpx')]))
    expect(result.current.held).toBe(2)

    await act(() => result.current.finish({}))

    expect(result.current.held).toBe(2)
  })
})

describe('useSetup, when the worker has stopped for good', () => {
  it('lets the import through without asking, so the stopped message shows', () => {
    const { result, addFiles } = renderSetup({ workerStopped: true })

    act(() => result.current.requestImport([file('a.fit')]))

    expect(result.current.open).toBe(false)
    expect(addFiles).toHaveBeenCalledTimes(1)
  })
})

describe('useSetup, saving the answers', () => {
  it('keeps the files held and the dialog open, and reports why, when the save is refused', async () => {
    const { result, addFiles, save } = renderSetup()
    save.mockRejectedValueOnce(new Error('Could not save your profile.'))
    act(() => result.current.requestImport([file('a.fit')]))

    await act(() => result.current.finish({ birthYear: 1990 }))

    expect(result.current.open).toBe(true)
    expect(result.current.saveError).toBe('Could not save your profile.')
    expect(result.current.saving).toBe(false)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('does not mark signed-in setup done or release the files until the save has resolved', async () => {
    const { result, addFiles, save } = renderSetup({ status: 'signed-in' })
    act(() => result.current.requestImport([file('a.fit')]))
    let finish: () => void = () => undefined
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.finish({})
    })

    expect(result.current.saving).toBe(true)
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull()
    expect(addFiles).not.toHaveBeenCalled()

    await act(async () => {
      finish()
      await pending
    })
    expect(localStorage.getItem(DEVICE_KEY)).toBe('1')
    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(result.current.open).toBe(false)
  })

  it('sends the held files once a retry after a refusal succeeds', async () => {
    const { result, addFiles, save } = renderSetup({ status: 'signed-in' })
    save.mockRejectedValueOnce(new Error('Try again'))
    act(() => result.current.requestImport([file('a.fit')]))
    await act(() => result.current.finish({}))
    expect(addFiles).not.toHaveBeenCalled()

    await act(() => result.current.finish({}))

    expect(names(addFiles)).toEqual(['a.fit'])
    expect(result.current.saveError).toBeNull()
  })
})

describe('useSetup, signed in', () => {
  it('asks on a device where setup has not been answered, whatever the preferences say', () => {
    const { result, addFiles } = renderSetup({ status: 'signed-in', preferencesDone: true })

    act(() => result.current.requestImport([file('a.fit')]))

    expect(result.current.open).toBe(true)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('does not ask again on a device where setup was answered while signed in', () => {
    localStorage.setItem(DEVICE_KEY, '1')
    const { result, addFiles } = renderSetup({ status: 'signed-in' })

    act(() => result.current.requestImport([file('a.fit')]))

    expect(result.current.open).toBe(false)
    expect(addFiles).toHaveBeenCalledTimes(1)
  })

  it('records the device flag and sends the held files when the dialog is answered', async () => {
    const { result, addFiles, save } = renderSetup({ status: 'signed-in' })
    act(() => result.current.requestImport([file('a.fit')]))

    await act(() => result.current.finish({ birthYear: 1990 }))

    expect(localStorage.getItem(DEVICE_KEY)).toBe('1')
    expect(save).toHaveBeenCalledWith({ birthYear: 1990, setupDone: true })
    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(result.current.open).toBe(false)
  })

  it('still sends the files when the browser refuses to store the device flag', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    const { result, addFiles } = renderSetup({ status: 'signed-in' })
    act(() => result.current.requestImport([file('a.fit')]))

    await act(() => result.current.finish({}))

    expect(addFiles).toHaveBeenCalledTimes(1)
  })
})
