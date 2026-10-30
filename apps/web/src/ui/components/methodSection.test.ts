// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRequestedMethodSection,
  requestMethodSection,
  requestedMethodSection,
} from './methodSection'

/** Moves the hash, and resolves when the browser reports the change, as it does for a link. */
function navigateTo(hash: string): Promise<void> {
  // A hash already in place changes nothing, so the browser reports nothing to wait for.
  if (window.location.hash === hash) return Promise.resolve()
  const changed = new Promise<void>((resolve) =>
    window.addEventListener('hashchange', () => resolve(), { once: true }),
  )
  window.location.hash = hash
  return changed
}

afterEach(() => {
  clearRequestedMethodSection()
  // Back to no hash without an event, so the next test starts from the same place whatever ran before.
  window.history.replaceState(null, '', window.location.pathname)
})

describe('methodSection', () => {
  it('holds the one section a link asked for, until the page takes it', () => {
    expect(requestedMethodSection()).toBeNull()

    requestMethodSection('method-grades')
    expect(requestedMethodSection()).toBe('method-grades')

    clearRequestedMethodSection()
    expect(requestedMethodSection()).toBeNull()
  })

  it('keeps the latest request, so a second link replaces the first', () => {
    requestMethodSection('method-grades')
    requestMethodSection('method-hr')
    expect(requestedMethodSection()).toBe('method-hr')
  })

  it('keeps a request through the hash change its own link made', async () => {
    await navigateTo('#/')
    requestMethodSection('method-grades')

    await navigateTo('#/method')

    expect(requestedMethodSection()).toBe('method-grades')
  })

  it('drops a request at the next hash change its link did not make', async () => {
    await navigateTo('#/')
    requestMethodSection('method-grades')
    await navigateTo('#/method')

    await navigateTo('#/')

    expect(requestedMethodSection()).toBeNull()
  })
})
