import { vi } from 'vitest'

/**
 * Records the hashchange listeners the page adds, in the order the window will run them. Call it before
 * the page mounts, and pass the list to browserHashChange.
 */
export function recordHashListeners(): EventListener[] {
  const listeners: EventListener[] = []
  type Add = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void
  const add = window.addEventListener.bind(window) as Add
  vi.spyOn(window, 'addEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === 'hashchange' && typeof listener === 'function') listeners.push(listener)
    add(type, listener, options)
  }) as typeof window.addEventListener)
  return listeners
}

/**
 * Runs a hashchange the way a browser does: each listener in turn, with a turn of microtasks between
 * them, so React can render from one listener's work before the next listener runs. A synchronous
 * dispatchEvent runs them back to back, which hides an ordering bug between them.
 */
export async function browserHashChange(listeners: readonly EventListener[], oldURL: string) {
  const event = new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href })
  for (const listener of [...listeners]) {
    listener(event)
    await Promise.resolve()
  }
  await new Promise((done) => setTimeout(done, 0))
}
