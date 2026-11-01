import { describe, expect, it, vi } from 'vitest'
import { ResumeHolder } from './resumeHolder'
import type { Writing } from './writerResume'

function writing(): Writing & { release: () => void } {
  let release = () => undefined as void
  const finished = new Promise<void>((resolve) => {
    release = resolve
  })
  return { cancel: vi.fn(), finished, release }
}

describe('the resume the worker holds', () => {
  it('ends the resume it holds and empties the slot', async () => {
    const holder = new ResumeHolder()
    const first = writing()
    holder.start(() => first)
    const ended = holder.end()
    first.release()
    await ended

    expect(first.cancel).toHaveBeenCalledTimes(1)
    expect(holder.get()).toBeNull()
  })

  it('keeps a newer resume that a load started while the old one was ending', async () => {
    const holder = new ResumeHolder()
    const old = writing()
    const newer = writing()
    holder.start(() => old)
    const ended = holder.end()
    holder.start(() => newer)
    old.release()
    await ended

    expect(holder.get()).toBe(newer)
  })

  it('restarts only where none is going', () => {
    const holder = new ResumeHolder()
    const first = writing()
    const second = writing()
    holder.restart(() => first)
    holder.restart(() => second)

    expect(holder.get()).toBe(first)
  })

  it('does not wait on a resume that failed', async () => {
    const holder = new ResumeHolder()
    holder.start(() => ({ cancel: () => undefined, finished: Promise.reject(new Error('x')) }))

    await expect(holder.end()).resolves.toBeUndefined()
    expect(holder.get()).toBeNull()
  })
})
