import { describe, expect, it, vi } from 'vitest'
import { asWriter, writerLockName } from './updaterLock'
import type { WriterLocks } from './updaterLock'

/** A lock manager with one lock per name, granted only while nobody holds it (`ifAvailable`). */
function fakeLocks(): WriterLocks & { held: Set<string>; asked: string[] } {
  const held = new Set<string>()
  const asked: string[] = []
  return {
    held,
    asked,
    request: async (name, _options, callback) => {
      asked.push(name)
      if (held.has(name)) return callback(null)
      held.add(name)
      try {
        return await callback({})
      } finally {
        held.delete(name)
      }
    },
  }
}

describe('asWriter', () => {
  it('names the lock the outbox flusher also takes', () => {
    expect(writerLockName('u1')).toBe('rca-flush-u1')
  })

  it('runs where the lock is free, and holds it until the run ends', async () => {
    const locks = fakeLocks()
    let heldDuring = false
    const result = await asWriter(
      'u1',
      async () => {
        heldDuring = locks.held.has('rca-flush-u1')
        return 7
      },
      locks,
    )
    expect(result).toEqual({ writer: true, value: 7 })
    expect(heldDuring).toBe(true)
    expect(locks.held.size).toBe(0)
  })

  it('does not run where another tab holds the lock', async () => {
    const locks = fakeLocks()
    locks.held.add('rca-flush-u1')
    const run = vi.fn(async () => 7)
    expect(await asWriter('u1', run, locks)).toEqual({ writer: false })
    expect(run).not.toHaveBeenCalled()
  })

  it('locks each account on its own', async () => {
    const locks = fakeLocks()
    locks.held.add('rca-flush-u1')
    expect(await asWriter('u2', async () => 1, locks)).toEqual({ writer: true, value: 1 })
  })

  it('writes as a lone tab where the browser has no locks', async () => {
    expect(await asWriter('u1', async () => 3, undefined)).toEqual({ writer: true, value: 3 })
  })

  it('writes when the browser refuses the lock itself', async () => {
    const locks: WriterLocks = {
      request: async () => {
        throw new DOMException('refused', 'SecurityError')
      },
    }
    expect(await asWriter('u1', async () => 5, locks)).toEqual({ writer: true, value: 5 })
  })

  it('passes the failure of the run on, and does not run it again', async () => {
    const locks = fakeLocks()
    const run = vi.fn(async () => {
      throw new Error('stopped')
    })
    await expect(asWriter('u1', run, locks)).rejects.toThrow('stopped')
    expect(run).toHaveBeenCalledOnce()
    expect(locks.held.size).toBe(0)
  })
})
