import { describe, expect, it, vi } from 'vitest'
import type { Writing } from './writerResume'
import type { WriterLocks } from './updaterLock'
import { resumeAsWriter } from './writerResume'

/** A lock manager that grants the lock only while nobody holds it, as the browser's does with `ifAvailable`. */
function fakeLocks(held = false): WriterLocks & { held: Set<string> } {
  const heldNames = new Set<string>(held ? ['rca-flush-u1'] : [])
  return {
    held: heldNames,
    request: async (name, _options, callback) => {
      if (heldNames.has(name)) return callback(null)
      heldNames.add(name)
      try {
        return await callback({})
      } finally {
        heldNames.delete(name)
      }
    },
  }
}

function resumeOf(finish: Promise<void> = Promise.resolve()) {
  const cancel = vi.fn<() => void>()
  const resume: Writing = { cancel, finished: finish }
  return Object.assign(resume, { cancel })
}

describe('a resume that runs in the writing tab only', () => {
  it('runs where the account’s writer lock is free, and holds the lock until the resume ends', async () => {
    const locks = fakeLocks()
    let heldDuring = false
    let release: () => void = () => undefined
    const start = vi.fn(() => {
      heldDuring = locks.held.has('rca-flush-u1')
      return resumeOf(new Promise<void>((resolve) => (release = resolve)))
    })

    const resume = resumeAsWriter('u1', start, locks)
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(heldDuring).toBe(true)
    expect(locks.held.has('rca-flush-u1')).toBe(true)

    release()
    await resume.finished
    expect(locks.held.size).toBe(0)
  })

  it('sends nothing in a tab whose account another tab is writing for', async () => {
    const start = vi.fn(() => resumeOf())

    await resumeAsWriter('u1', start, fakeLocks(true)).finished

    expect(start).not.toHaveBeenCalled()
  })

  it('does not start when it is cancelled before it has the lock', async () => {
    const start = vi.fn(() => resumeOf())
    // The browser grants the lock a moment after it is asked for.
    const granted = fakeLocks()
    const slow: WriterLocks = {
      request: async (name, options, callback) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return granted.request(name, options, callback)
      },
    }
    const resume = resumeAsWriter('u1', start, slow)
    resume.cancel()
    await resume.finished
    expect(start).not.toHaveBeenCalled()
  })

  it('cancels the resume it started when it is cancelled after', async () => {
    let release: () => void = () => undefined
    const inner = resumeOf(new Promise<void>((resolve) => (release = resolve)))
    const resume = resumeAsWriter('u1', () => inner, fakeLocks())
    await vi.waitFor(() => expect(release).not.toBeUndefined())
    await new Promise((resolve) => setTimeout(resolve, 5))

    resume.cancel()
    release()
    await resume.finished

    expect(inner.cancel).toHaveBeenCalledOnce()
  })
})
